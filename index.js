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

  return {
    users: [...game.users],
    buzzes: [...game.buzzes].map(b => {
      const [ name, team ] = b.split('-');
      return { name, team };
    }),
    scores: game.scores, // Assuming scores is an object { teamName: score }
    active: game.users.size,
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
  socket.on('createGame', (user) => { // Assuming user object { name, id } is sent by client
    const gameCode = generateGameCode();
    games[gameCode] = {
      users: new Set(),
      buzzes: new Set(),
      scores: {}, // Initialize scores
      // players: {} // as per original request, but users Set seems more aligned with current code for active count
    };
    if (user && user.id) { // Add creator to the game
        games[gameCode].users.add(user.id); // Or a more detailed user object
    }
    socket.join(gameCode); // Creator joins the game room
    socket.emit('gameCreated', { gameCode }); // Send code back to creator
    console.log(`${user ? user.name : 'A user'} created game: ${gameCode}`);
    // Emit initial state to the host who just created and joined
    io.to(gameCode).emit('active', games[gameCode].users.size);
    io.to(gameCode).emit('buzzes', []);
    io.to(gameCode).emit('scores', games[gameCode].scores);
  });

  socket.on('join', (data) => { // data will now include { user, gameCode }
    const { user, gameCode } = data;
    const game = games[gameCode];

    if (game) {
      socket.join(gameCode);
      // Store gameCode and userId on the socket for easier access later (e.g., on disconnect)
      socket.gameCode = gameCode;
      socket.userId = user.id; // Assuming user object has a unique id property

      game.users.add(user.id); // Add user's ID to the set of users in the game
      // Emit updated active count to the specific game room
      io.to(gameCode).emit('active', game.users.size);
      console.log(`${user.name} joined game ${gameCode}! Active users in game: ${game.users.size}`);
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
        socket.emit('active', gameData.active);
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
  // This is a simplified version. You might need to track which games a socket was part of.
  // For now, we'll assume a socket is only in one game for simplicity of disconnect.
  socket.on('disconnect', () => {
    // Iterate over all games to find the user and remove them
    // This is inefficient if there are many games.
    // A better approach would be to store gameCode on the socket object upon join.
    // e.g., socket.gameCode = gameCode;
    // For now, let's assume we'll add socket.gameCode when joining.
    const gameCode = socket.gameCode; // This needs to be set upon join
    if (gameCode && games[gameCode]) {
      // To properly remove the user, we need their ID.
      // This part of the logic requires knowing which user this socket represented.
      // Let's assume the 'join' event stores the user's ID on the socket: socket.userId = user.id;
      if (socket.userId) {
        games[gameCode].users.delete(socket.userId);
        io.to(gameCode).emit('active', games[gameCode].users.size);
        console.log(`A user with ID ${socket.userId} disconnected from game ${gameCode}. Active users: ${games[gameCode].users.size}`);
      }
    }
  });

})

server.listen(8090, () => console.log('Listening on 8090'))

module.exports = app;
