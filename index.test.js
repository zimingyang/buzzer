const http = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const app = require('./index'); // Your express app

let io, serverSocket, clientSocket, httpServer, games;

// Helper to promisify socket events
const waitFor = (socket, event) => {
  return new Promise((resolve) => {
    socket.once(event, resolve);
  });
};

describe('Buffer Buzzer Server Logic', () => {
  beforeAll((done) => {
    httpServer = http.createServer(app);
    io = new Server(httpServer);

    // Mock the games object from your index.js
    // This is a simplification. A more robust way would be to export 'games'
    // or provide a method to reset/access it for testing.
    // For now, we'll assume index.js modifies a global-like 'games' accessible via require('./index').games
    // If 'games' is not directly exportable, this will need adjustment.
    // Let's try to get it from the app instance if it's attached, or mock it.
    // Since app is just express, we'll need to adjust index.js to expose 'games' or test differently.

    // For the purpose of this test, we'll need to modify index.js to export 'games'
    // or have a way to access/reset it. Let's assume for now index.js is modified like:
    // module.exports = { app, games }; (and adjust the require above)
    // If not, these tests will fail or need significant refactoring based on how you can access game state.

    // Let's adjust the setup assuming we can't directly modify index.js for now
    // and focus on what we *can* test: socket emissions and basic responses.
    // We will need to re-initialize the 'games' object from index.js for each test suite or test.

    httpServer.listen(() => {
      const port = httpServer.address().port;
      // Setup server-side socket connection for direct interaction if needed
      // io.on('connection', (socket) => {
      //   serverSocket = socket;
      // });

      // Setup client-side socket
      clientSocket = new Client(`http://localhost:${port}`);
      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    io.close();
    clientSocket.close();
    httpServer.close();
  });

  // It's crucial to reset the state of 'games' from index.js before each test.
  // Since index.js doesn't export 'games' directly, this is tricky.
  // A common pattern is to have a reset function in index.js for testing.
  // e.g., module.exports = { app, resetGames: () => { games = {}; } }
  // Without it, tests can interfere with each other.
  // For now, we'll acknowledge this limitation.

  describe('Game Creation', () => {
    test('should create a new game and return a game code', async () => {
      const userCreating = { name: 'HostUser', id: 'host123' };
      clientSocket.emit('createGame', userCreating);

      const response = await waitFor(clientSocket, 'gameCreated');
      expect(response).toBeDefined();
      expect(response.gameCode).toBeDefined();
      expect(response.gameCode).toHaveLength(4);
      // Further state checks would require access to the 'games' object in index.js
    });
  });

  describe('Joining a Game', () => {
    let testGameCode;

    beforeAll(async () => {
      // Create a game to join for these tests
      return new Promise((resolve) => {
        const tempClient = new Client(clientSocket.io.uri);
        tempClient.on('connect', () => {
          tempClient.emit('createGame', { name: 'TestHost', id: 'testHostId' });
          tempClient.once('gameCreated', ({ gameCode }) => {
            testGameCode = gameCode;
            tempClient.close();
            resolve();
          });
        });
      });
    });

    test('should allow a user to join an existing game', async () => {
      const userJoining = { name: 'Player1', team: 'Blue', id: 'player123' };
      clientSocket.emit('join', { user: userJoining, gameCode: testGameCode });

      // We expect an 'active' event to be emitted to the room
      // To capture this, the client needs to be "in the room"
      // which happens server-side. We listen for it on the current clientSocket.
      const activeUpdate = await waitFor(clientSocket, 'active');
      expect(activeUpdate).toBeGreaterThan(0); // At least one user (the joiner)
      // More detailed assertions would check if the specific user was added
      // to the game's user list, requiring access to the server's 'games' state.
    });

    test('should emit an error for joining a non-existent game', async () => {
      const userJoining = { name: 'Player2', team: 'Red', id: 'player456' };
      clientSocket.emit('join', { user: userJoining, gameCode: 'XXXX' }); // Invalid code

      const errorResponse = await waitFor(clientSocket, 'error');
      expect(errorResponse).toBeDefined();
      expect(errorResponse.message).toEqual('Game not found.');
    });
  });

  // TODO: Add tests for 'buzz', 'clear', 'awardPoint', and 'disconnect' events
  // These will also face the challenge of verifying server-side state ('games' object)
  // without direct access or a reset mechanism in index.js.
}); 