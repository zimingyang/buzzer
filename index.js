const http = require('http')
const express = require('express')
const socketio = require('socket.io')

const app = express();
const server = http.Server(app);
const io = socketio(server);

const title = 'Ziming Buzzer'

// New structure for multiple games
let games = {};

// Host reconnection timeout in milliseconds (5 minutes)
const HOST_RECONNECT_TIMEOUT = 5 * 60 * 1000;
// User reconnection timeout in milliseconds (2 minutes)
const USER_RECONNECT_TIMEOUT = 2 * 60 * 1000;

// Helper function to generate a unique 4-character game code
const generateGameCode = () => {
  let code;
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
  } while (games[code]); // Ensure code is unique
  return code;
};

// Updated getData to fetch data for a specific game
const getGameData = (gameCode) => {
  const game = games[gameCode];
  if (!game) return null; // Or handle error appropriately

  // Debug log to see what's in the map
  console.log(`Game ${gameCode} userMap has ${game.userMap.size} entries:`, 
    Array.from(game.userMap.entries()));

  return {
    users: Array.from(game.userMap.values()).filter(u => u.disconnectedAt === null), // Only send active users
    buzzes: [...game.buzzes].map(b => {
      const [ name, team ] = b.split('-');
      return { name, team };
    }),
    scores: game.scores, // Assuming scores is an object { teamName: score }
    active: game.userMap.size,
  };
};

app.use(express.static('public'))
app.set('view engine', 'pug')

app.get('/', (req, res) => res.render('index', { title }))
app.get('/host', (req, res) => {
  const gameCode = req.query.game;
  if (!gameCode || !games[gameCode]) {
    // Optionally, redirect to home or show an error page if game code is missing or invalid
    return res.redirect('/?error=invalid_game_code');
  }
  const gameData = getGameData(gameCode);
  res.render('host', Object.assign({ title, gameCode }, gameData));
});

// New route for players
app.get('/play', (req, res) => {
  const gameCode = req.query.game;
  const user = req.query.user ? JSON.parse(req.query.user) : {}; // Get user from query

  if (!gameCode || !games[gameCode]) {
    return res.redirect('/?error=invalid_game_code_or_not_joined');
  }
  // We might want to pass more specific player data here later
  // For now, just the gameCode and title is enough for the pug template
  // The client-side JS ('/play.js') will handle fetching full game state via sockets.
  res.render('play', { title, gameCode, user });
});

io.on('connection', (socket) => {
  // Extract user info from socket handshake query if available
  let queryUser = {};
  try {
    if (socket.handshake.query.user) {
      queryUser = JSON.parse(socket.handshake.query.user);
      if (queryUser && queryUser.id && queryUser.name) {
        socket.userId = queryUser.id;
        
        // Check if this user might be a host for any game
        for (const [code, game] of Object.entries(games)) {
          // If name matches a host who disconnected, restore connection 
          if (game.hostName === queryUser.name && game.hostDisconnectedAt !== null) {
            const timeElapsed = Date.now() - game.hostDisconnectedAt;
            
            if (timeElapsed <= HOST_RECONNECT_TIMEOUT) {
              console.log(`Potential host ${queryUser.name} reconnected, restoring for game ${code}`);
              game.hostId = queryUser.id;
              socket.gameCode = code;
              socket.join(code);
              
              // Clear timeout to delete the game
              if (game.hostTimeoutId) {
                clearTimeout(game.hostTimeoutId);
                game.hostTimeoutId = null;
              }
              game.hostDisconnectedAt = null;
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("Error parsing user data from socket query:", e);
  }

  // Game Creation
  socket.on('createGame', (user) => { // Expecting full user object now
    console.log('Creating game with user:', user);
    const gameCode = generateGameCode();
    games[gameCode] = {
      userMap: new Map(), // Maps user IDs to user objects with more details
      buzzes: new Set(),
      scores: {}, // Initialize scores
      hostId: user ? user.id : null, // Track the host ID
      hostName: user ? user.name : null, // Track the host name for reconnection
      hostDisconnectedAt: null, // Track when the host disconnected
      hostTimeoutId: null, // Track the timeout for host reconnection
    };
    
    // Host is not added to userMap intentionally
    // Instead, we just track their ID separately
    
    socket.join(gameCode); // Creator joins the game room
    socket.gameCode = gameCode; // Store game code on socket
    if (user) socket.userId = user.id; // Store user ID on socket
    
    socket.emit('gameCreated', { gameCode }); // Send code back to creator
    console.log(`${user ? user.name : 'A user'} created game: ${gameCode} as host`);
    
    // Emit initial state to the host who just created and joined
    io.to(gameCode).emit('active', Array.from(games[gameCode].userMap.values()));
    io.to(gameCode).emit('buzzes', []);
    io.to(gameCode).emit('scores', games[gameCode].scores);
  });

  socket.on('join', (data) => { // data will now include { user, gameCode }
    const { user, gameCode } = data;
    console.log('User joining:', user, 'to game:', gameCode);
    const game = games[gameCode];

    if (game) {
      socket.gameCode = gameCode; // Store game code on socket first

      // Try to find if this user ID is already in the game and disconnected
      if (user && user.id && game.userMap.has(user.id)) {
        const existingUser = game.userMap.get(user.id);
        if (existingUser.disconnectedAt !== null) { // User was disconnected
          const timeElapsed = Date.now() - existingUser.disconnectedAt;
          if (timeElapsed <= USER_RECONNECT_TIMEOUT) {
            console.log(`User ${existingUser.name} (ID: ${user.id}) reconnected to game ${gameCode}`);
            if (existingUser.reconnectTimeoutId) {
              clearTimeout(existingUser.reconnectTimeoutId);
              existingUser.reconnectTimeoutId = null;
            }
            existingUser.socketId = socket.id;
            existingUser.disconnectedAt = null;
            existingUser.name = user.name; // Update name/team in case they changed it on the form
            existingUser.team = user.team;
            
            socket.userId = existingUser.id;
            socket.join(gameCode);
            io.to(gameCode).emit('active', Array.from(game.userMap.values()).filter(u => u.disconnectedAt === null));
            // Emit redirect event for reconnected user
            socket.emit('redirectToPlay', { gameCode, user: existingUser }); 
            return; // Reconnection successful
          } else {
            console.log(`User ${existingUser.name} (ID: ${user.id}) reconnect attempt for game ${gameCode} was too late. Removing old entry.`);
            if (existingUser.reconnectTimeoutId) clearTimeout(existingUser.reconnectTimeoutId);
            game.userMap.delete(user.id); // Old entry is stale, remove it before proceeding to add as new
          }
        } else {
          // User with this ID is already connected and not marked as disconnected.
          // This could be a join attempt from another tab with the same localStorage.
          console.warn(`User ${user.name} (ID: ${user.id}) attempted to join game ${gameCode} but an active session with this ID already exists.`);
          socket.emit('error', { message: 'An active session with your user ID already exists in this game. Please check other tabs or browsers.' });
          return;
        }
      }

      // Standard join logic (new user, or user whose previous stale session was cleared)
      socket.join(gameCode);
      socket.userId = user.id; // Assuming user object has a unique id property

      // Check if this is a host rejoining (existing logic)
      if (game.hostDisconnectedAt !== null) {
        const timeElapsed = Date.now() - game.hostDisconnectedAt;
        
        // Check if this is a host reconnection attempt
        const isHostReconnection = 
          (game.hostName === user.name) || // Name matches original host
          (user.team === '0'); // Using team '0' as a special indicator
        
        console.log('Host reconnection check:', {
          hostName: game.hostName,
          userName: user.name,
          userTeam: user.team,
          isHostReconnection,
          timeElapsed,
          timeout: HOST_RECONNECT_TIMEOUT
        });
        
        if (isHostReconnection && timeElapsed <= HOST_RECONNECT_TIMEOUT) {
          // Update the host ID to the new socket ID
          game.hostId = user.id;
          // Clear any pending host timeout
          if (game.hostTimeoutId) {
            clearTimeout(game.hostTimeoutId);
            game.hostTimeoutId = null;
          }
          game.hostDisconnectedAt = null;
          
          console.log(`Host ${user.name} rejoined game ${gameCode} and regained host status`);
          
          // Redirect to host page
          console.log('Sending redirectToHost event to socket:', socket.id);
          socket.emit('redirectToHost', { gameCode });
          
          // Still send the current user list to keep the host UI updated
          socket.emit('active', Array.from(game.userMap.values()).filter(u => u.disconnectedAt === null));
          return;
        }
      }

      // If not a returning host, continue with regular join logic
      if (game.hostId !== user.id) {
        // Ensure user object has all required properties
        const safeUser = {
          id: user.id,
          name: user.name || 'Unknown',
          team: user.team || 'Unknown',
          socketId: socket.id,
          disconnectedAt: null,
          reconnectTimeoutId: null
        };
        
        game.userMap.set(user.id, safeUser); // Store the full user object, keyed by persistent user.id
        
        console.log('User joined, current userMap:', Array.from(game.userMap.entries()));
        
        // Emit updated users list to the specific game room
        const usersList = Array.from(game.userMap.values()).filter(u => u.disconnectedAt === null);
        console.log('Sending active users list:', usersList);
        io.to(gameCode).emit('active', usersList);
        // Emit redirect event for newly joined user
        socket.emit('redirectToPlay', { gameCode, user: safeUser });
        console.log(`${user.name} joined game ${gameCode}! Active users in game: ${usersList.length}`);
      } else {
        console.log(`Host ${user.name} rejoined game ${gameCode}`);
        // Still send the current user list to keep the host UI updated
        socket.emit('active', Array.from(game.userMap.values()).filter(u => u.disconnectedAt === null));
        // If it's the host rejoining their own game (not through special host path), they might be on index page
        // and should be redirected to host view.
        // However, this case is primarily handled by the redirectToHost logic earlier.
        // If they are joining as a host, they get redirectToHost.
        // If they are joining as a player to their own game (which shouldn't typically happen unless they cleared storage and rejoined as a normal player)
        // then redirectToPlay is fine.
      }
    } else {
      // Handle error: game not found - use socket.emit instead of throwing an error
      try {
        socket.emit('error', { message: 'Game not found.' });
        console.log(`Attempt to join non-existent game: ${gameCode} by ${user.name}`);
      } catch (err) {
        console.error("Error sending 'Game not found' message:", err);
      }
    }
  });

  socket.on('buzz', (data) => { // data will now include { user, gameCode }
    const { user, gameCode } = data;
    const game = games[gameCode];

    if (game) {
      console.log(`[Game ${gameCode}] Buzz received from user:`, user);
      const buzzData = `${user.name}-${user.team}`;
      console.log(`[Game ${gameCode}] Generated buzzData: "${buzzData}"`);

      console.log(`[Game ${gameCode}] Current buzzes BEFORE add:`, Array.from(game.buzzes));
      const originalSize = game.buzzes.size;

      game.buzzes.add(buzzData);

      console.log(`[Game ${gameCode}] Current buzzes AFTER add:`, Array.from(game.buzzes));
      const newSize = game.buzzes.size;

      if (newSize > originalSize) {
        console.log(`[Game ${gameCode}] Successfully added buzz. New size: ${newSize}`);
      } else if (game.buzzes.has(buzzData)) {
        console.log(`[Game ${gameCode}] Buzz "${buzzData}" already existed or was not added. Size still: ${newSize}`);
      } else {
        // This case should ideally not be reached if buzzData was truly new and game.buzzes is a Set.
        console.error(`[Game ${gameCode}] FAILED to add buzz "${buzzData}" for an unknown reason. Size still ${newSize}.`);
      }
      
      const formattedBuzzes = [...game.buzzes].map(b => {
        const parts = b.split('-');
        // Handle cases where name or team might be missing or contain hyphens
        const team = parts.pop(); // Last part is team
        const name = parts.join('-'); // Everything else is name
        
        if (name === undefined || team === undefined) {
            console.warn(`[Game ${gameCode}] Malformed buzz string in Set: "${b}" during formatting. Name: ${name}, Team: ${team}`);
            return { name: b, team: 'Error' }; // Fallback for malformed data
        }
        return { name, team };
      });

      console.log(`[Game ${gameCode}] Emitting formattedBuzzes:`, formattedBuzzes);
      io.to(gameCode).emit('buzzes', formattedBuzzes);
      // Keep the original log line for successful buzz registration confirmation
      if (user && user.name && user.team) {
          console.log(`${user.name} from team ${user.team} buzzed in game ${gameCode}!`);
      } else {
          console.log(`A user (details potentially incomplete) buzzed in game ${gameCode}. Buzzdata: "${buzzData}"`);
      }
    } else {
      // Handle error: game not found
      console.log(`Buzz attempt in non-existent game: ${gameCode} by ${user.name}`);
    }
  });

  socket.on('clear', (gameCode) => { // gameCode is sent by the host
    const game = games[gameCode];
    if (game) {
      game.buzzes = new Set();
      // Emit cleared buzzes to the specific game room
      io.to(gameCode).emit('buzzes', []);
      console.log(`Buzzes cleared for game ${gameCode}`);
    } else {
      // Handle error: game not found
      console.log(`Clear attempt for non-existent game: ${gameCode}`);
    }
  });

  socket.on('awardPoint', ({ teamName, gameCode }) => {
    const game = games[gameCode];
    if (game && game.scores) {
      game.scores[teamName] = (game.scores[teamName] || 0) + 1;
      io.to(gameCode).emit('scores', game.scores);
      console.log(`Point awarded to ${teamName} in game ${gameCode}. New scores:`, game.scores);
    } else {
      console.log(`Award point attempt for non-existent game or game without scores: ${gameCode}`);
      // Optionally emit an error back to the host who tried to award the point
      // socket.emit('error', { message: 'Failed to award point: Game not found or scores not initialized.' });
    }
  });

  socket.on('hostLoaded', ({ gameCode }) => {
    if (games[gameCode]) {
      socket.join(gameCode);
      socket.gameCode = gameCode; // Store game code on socket

      // Update stored socket information for the host
      const user = JSON.parse(socket.handshake.query.user || '{}');
      if (user && user.id) {
        socket.userId = user.id;
        games[gameCode].hostId = user.id; // Ensure hostId is current
        games[gameCode].hostName = user.name; // Ensure hostName is current
        
        // Clear disconnect status if the host reconnected
        if (games[gameCode].hostDisconnectedAt) {
          games[gameCode].hostDisconnectedAt = null;
          if (games[gameCode].hostTimeoutId) {
            clearTimeout(games[gameCode].hostTimeoutId);
            games[gameCode].hostTimeoutId = null;
          }
          console.log(`Host reconnected to game ${gameCode}`);
        }
      }

      console.log(`Host socket ${socket.id} joined room ${gameCode} upon page load.`);

      // Send current game state to this host socket to ensure UI is immediately up-to-date
      const gameData = getGameData(gameCode);
      if (gameData) {
        socket.emit('active', gameData.users); // Send full user objects
        socket.emit('buzzes', gameData.buzzes); // This is already formatted as [{name, team}]
        socket.emit('scores', gameData.scores);
      }
    } else {
      console.log(`Host socket ${socket.id} tried to load non-existent game: ${gameCode}`);
      // Inform the client if the game is not found
      socket.emit('error', { message: 'Game not found on host page load.' });
    }
  });

  socket.on('playerLoaded', ({ gameCode, user }) => {
    if (games[gameCode] && user && user.id) {
      socket.join(gameCode);
      socket.gameCode = gameCode;
      socket.userId = user.id;

      const game = games[gameCode];
      // Check if this player was disconnected and is now rejoining via page load/refresh
      if (game.userMap.has(user.id)) {
        const existingPlayer = game.userMap.get(user.id);
        if (existingPlayer.disconnectedAt) {
          console.log(`Player ${user.name} (ID: ${user.id}) reconnected to game ${gameCode} via page load.`);
          if (existingPlayer.reconnectTimeoutId) {
            clearTimeout(existingPlayer.reconnectTimeoutId);
            existingPlayer.reconnectTimeoutId = null;
          }
          existingPlayer.socketId = socket.id; // Update socketId
          existingPlayer.disconnectedAt = null;
          // Name and team might have been passed in URL if they changed, but user object from client is source of truth here
          existingPlayer.name = user.name;
          existingPlayer.team = user.team;

          // Notify the whole room that this player is active again
          const currentActiveUsers = Array.from(game.userMap.values()).filter(u => u.disconnectedAt === null);
          io.to(gameCode).emit('active', currentActiveUsers);

        } else {
          // Player is already in game and connected, this might be a redundant load event
          // or a new tab. Update socketId just in case.
          existingPlayer.socketId = socket.id;
        }
      } else {
        // This is unusual if 'playerLoaded' is emitted after a successful join sequence.
        // Could happen if player bookmarks /play page and tries to access directly without proper join.
        // Or if server restarted and user refreshed.
        // For now, we'll add them if they are not in userMap. This might need more robust handling.
        console.warn(`Player ${user.name} (ID: ${user.id}) loaded /play page for game ${gameCode} but was not in userMap. Adding them.`);
        const newPlayer = {
            id: user.id,
            name: user.name || 'Unknown',
            team: user.team || 'Unknown',
            socketId: socket.id,
            disconnectedAt: null,
            reconnectTimeoutId: null
        };
        game.userMap.set(user.id, newPlayer);

        // Notify the whole room that this new player is active
        const currentActiveUsersAfterAdd = Array.from(game.userMap.values()).filter(u => u.disconnectedAt === null);
        io.to(gameCode).emit('active', currentActiveUsersAfterAdd);
      }

      console.log(`Player socket ${socket.id} (${user.name}) confirmed loaded for game ${gameCode}.`);

      // Send current game state to this player socket
      const gameData = getGameData(gameCode);
      if (gameData) {
        socket.emit('active', gameData.users);
        socket.emit('buzzes', gameData.buzzes);
        socket.emit('scores', gameData.scores);
      }
      // If this user is actually the host but landed on /play, redirect them
      if (game.hostId === user.id) {
        socket.emit('redirectToHost', { gameCode });
      }

    } else {
      console.log(`Player socket ${socket.id} tried to load game ${gameCode} but game or user data was missing/invalid.`);
      socket.emit('error', { message: 'Game not found or user data invalid on player page load.' });
    }
  });

  // Handling disconnects needs to be game-aware too
  socket.on('disconnect', () => {
    const gameCode = socket.gameCode;
    const userId = socket.userId; // Get the persistent userId stored on the socket

    if (gameCode && games[gameCode] && userId) {
      const game = games[gameCode];

      if (userId === game.hostId) { // Host disconnected
        console.log(`Host with ID ${userId} disconnected from game ${gameCode}`);
        game.hostDisconnectedAt = Date.now();
        game.hostTimeoutId = setTimeout(() => {
          console.log(`Host for game ${gameCode} did not reconnect within timeout period. Cleaning up game.`);
          io.to(gameCode).emit('error', { message: 'Game has ended because the host did not reconnect.' });
          // Clean up all user reconnect timeouts in this game before deleting
          game.userMap.forEach(usr => {
            if (usr.reconnectTimeoutId) {
              clearTimeout(usr.reconnectTimeoutId);
            }
          });
          delete games[gameCode];
        }, HOST_RECONNECT_TIMEOUT);
      } else if (game.userMap.has(userId)) { // Regular user disconnected
        const user = game.userMap.get(userId);
        
        // Only process disconnect if it's from the user's current/latest socket
        if (user.socketId === socket.id) {
          user.disconnectedAt = Date.now();
          user.socketId = null; // Clear socketId as this one is now closed
          console.log(`User ${user.name} (ID: ${userId}) marked as disconnected from game ${gameCode}. Will be removed if no reconnect in ${USER_RECONNECT_TIMEOUT / 1000}s.`);
          
          // Emit updated active list (user will appear removed)
          io.to(gameCode).emit('active', Array.from(game.userMap.values()).filter(u => u.disconnectedAt === null));

          user.reconnectTimeoutId = setTimeout(() => {
            // Check if user is still marked as disconnected (i.e., hasn't reconnected)
            if (user.disconnectedAt !== null) {
              console.log(`User ${user.name} (ID: ${userId}) did not reconnect to game ${gameCode}. Permanently removing.`);
              game.userMap.delete(userId);
              // Emit updated active list
              io.to(gameCode).emit('active', Array.from(game.userMap.values()).filter(u => u.disconnectedAt === null));
            }
          }, USER_RECONNECT_TIMEOUT);
        } else {
          console.log(`Old socket for user ${user.name} (ID: ${userId}) disconnected after they already reconnected with a new socket. No action needed.`);
        }
      } else {
        console.log(`User with ID ${userId} disconnected from game ${gameCode}, but was not found in userMap.`);
      }
    } else {
      // This can happen if a socket disconnects before successfully joining a game
      // or if socket.gameCode or socket.userId were not set.
      console.log(`Socket ${socket.id} disconnected without a game or user context.`);
    }
  });

  // Add error handling for socket events
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
})

server.listen(8090, () => console.log('Listening on 8090'))

module.exports = app;
