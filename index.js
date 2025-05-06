const http = require('http')
const express = require('express')
const socketio = require('socket.io')

const app = express();
const server = http.Server(app);
const io = socketio(server);

const title = 'Ziming Buzzer'

// New structure for multiple games
let games = {};

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
    users: Array.from(game.userMap.values()), // Return array of user objects
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

io.on('connection', (socket) => {
  // Game Creation
  socket.on('createGame', (user) => { // Expecting full user object now
    console.log('Creating game with user:', user);
    const gameCode = generateGameCode();
    games[gameCode] = {
      userMap: new Map(), // Maps user IDs to user objects with more details
      buzzes: new Set(),
      scores: {}, // Initialize scores
      hostId: user ? user.id : null, // Track the host ID
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
      socket.join(gameCode);
      // Store gameCode and userId on the socket for easier access later (e.g., on disconnect)
      socket.gameCode = gameCode;
      socket.userId = user.id; // Assuming user object has a unique id property

      // Don't add the host to the player list if they're joining
      if (game.hostId !== user.id) {
        // Ensure user object has all required properties
        const safeUser = {
          id: user.id,
          name: user.name || 'Unknown',
          team: user.team || 'Unknown'
        };
        
        game.userMap.set(user.id, safeUser); // Store the full user object
        
        console.log('User joined, current userMap:', Array.from(game.userMap.entries()));
        
        // Emit updated users list to the specific game room
        const usersList = Array.from(game.userMap.values());
        console.log('Sending active users list:', usersList);
        io.to(gameCode).emit('active', usersList);
        console.log(`${user.name} joined game ${gameCode}! Active users in game: ${game.userMap.size}`);
      } else {
        console.log(`Host ${user.name} rejoined game ${gameCode}`);
        // Still send the current user list to keep the host UI updated
        socket.emit('active', Array.from(game.userMap.values()));
      }
    } else {
      // Handle error: game not found
      socket.emit('error', { message: 'Game not found.' });
      console.log(`Attempt to join non-existent game: ${gameCode} by ${user.name}`);
    }
  });

  socket.on('buzz', (data) => { // data will now include { user, gameCode }
    const { user, gameCode } = data;
    const game = games[gameCode];

    if (game) {
      // Buzz format: `${user.name}-${user.team}`
      const buzzData = `${user.name}-${user.team}`;
      game.buzzes.add(buzzData);
      // Emit updated buzzes to the specific game room
      const formattedBuzzes = [...game.buzzes].map(b => {
        const [ name, team ] = b.split('-');
        return { name, team };
      });
      io.to(gameCode).emit('buzzes', formattedBuzzes);
      console.log(`${user.name} from team ${user.team} buzzed in game ${gameCode}!`);
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
      // Optionally, inform the client if the game is not found
      // socket.emit('error', { message: 'Game not found on host page load.' });
    }
  });

  // Handling disconnects needs to be game-aware too
  socket.on('disconnect', () => {
    const gameCode = socket.gameCode;
    if (gameCode && games[gameCode]) {
      if (socket.userId && socket.userId !== games[gameCode].hostId) {
        games[gameCode].userMap.delete(socket.userId);
        
        console.log('User disconnected, current userMap:', 
          Array.from(games[gameCode].userMap.entries()));
        
        // Send updated user list to all clients in the game
        const usersList = Array.from(games[gameCode].userMap.values());
        io.to(gameCode).emit('active', usersList);
        console.log(`A user with ID ${socket.userId} disconnected from game ${gameCode}. Active users: ${games[gameCode].userMap.size}`);
      } else if (socket.userId === games[gameCode].hostId) {
        console.log(`Host with ID ${socket.userId} disconnected from game ${gameCode}`);
        // Optionally handle host disconnect differently, e.g. notify players
      }
    }
  });

})

server.listen(8090, () => console.log('Listening on 8090'))

module.exports = app;
