/**
 * @jest-environment jsdom
 */

const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock Socket.IO client
const mockEmit = jest.fn();
const mockOn = jest.fn();
const mockSocket = {
  on: mockOn,
  emit: mockEmit,
  id: 'testSocketId123',
};
const mockIo = jest.fn(() => mockSocket);
global.io = mockIo;

// Mock localStorage
let mockLocalStorageStore = {};
global.localStorage = {
  getItem: jest.fn(key => mockLocalStorageStore[key] || null),
  setItem: jest.fn((key, value) => {
    mockLocalStorageStore[key] = value.toString();
  }),
  removeItem: jest.fn(key => {
    delete mockLocalStorageStore[key];
  }),
  clear: jest.fn(() => {
    mockLocalStorageStore = {};
  }),
};

// Mock window.location.href for navigation testing
const mockLocation = {
    href: ''
};
Object.defineProperty(window, 'location', {
    value: mockLocation,
    writable: true
});


describe('Player Join Logic (public/join.js)', () => {
  beforeEach(() => {
    // Reset mocks and localStorage before each test
    mockEmit.mockClear();
    mockOn.mockClear();
    mockIo.mockClear();
    localStorage.clear();
    mockLocalStorageStore = {}; // Ensure it's really empty

    // Set up a basic HTML structure expected by join.js
    document.body.innerHTML = `
      <div class="js-body">
        <form class="js-join">
          <input name="name" value="TestUser" />
          <input name="team" value="TestTeam" />
          <input name="gameCode" value="ABCD" />
          <button type="submit">Join</button>
        </form>
        <div class="js-joined hidden">
          <p class="js-joined-info"></p>
          <button class="js-edit">Edit</button>
        </div>
        <button class="js-buzzer">Buzz</button>
        <div class="js-game-code-display"></div>
        <div class="js-error-message"></div>
        <button class="js-create-game">Create Game</button>
      </div>
    `;

    // Dynamically require join.js after DOM and mocks are set up
    // This ensures it attaches event listeners to the JSDOM elements
    // and uses our mocked socket and localStorage
    require('./public/join.js');
  });

  test('should initialize with user info from localStorage if present', () => {
    const userData = { name: 'StoredUser', team: 'StoredTeam', id: 12345 };
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('currentGameCode', 'XYZ1');

    // Re-require or call an init function if join.js supports it
    // For this setup, we rely on the initial execution within a fresh describe/beforeEach
    // or you might need to extract getUserInfo into an exportable function and call it.
    // Let's clear and re-setup for this specific scenario for simplicity.
    document.body.innerHTML = `
      <div class="js-body">
        <form class="js-join">
          <input name="name" />
          <input name="team" />
          <input name="gameCode" />
        </form>
        <div class="js-game-code-display"></div>
      </div>
    `;
    mockLocalStorageStore = {
        user: JSON.stringify(userData),
        currentGameCode: 'XYZ1'
    };
    require('./public/join.js'); // Simulating script load after localStorage is set

    expect(document.querySelector('[name=name]').value).toBe('StoredUser');
    expect(document.querySelector('[name=team]').value).toBe('StoredTeam');
    expect(document.querySelector('.js-game-code-display').textContent).toBe('Game Code: XYZ1');
  });

  test('form submission should emit "join" event and save user info', () => {
    const form = document.querySelector('.js-join');
    const nameInput = form.querySelector('[name=name]');
    const teamInput = form.querySelector('[name=team]');
    const gameCodeInput = form.querySelector('[name=gameCode]');

    nameInput.value = 'NewUser';
    teamInput.value = 'RedTeam';
    gameCodeInput.value = 'WXYZ';

    form.dispatchEvent(new Event('submit'));

    expect(mockEmit).toHaveBeenCalledWith('join', {
      user: expect.objectContaining({
        name: 'NewUser',
        team: 'RedTeam',
        id: expect.any(Number), // Or more specific if ID generation is predictable
      }),
      gameCode: 'WXYZ',
    });

    const storedUser = JSON.parse(localStorage.getItem('user'));
    expect(storedUser.name).toBe('NewUser');
    expect(storedUser.team).toBe('RedTeam');
    expect(localStorage.getItem('currentGameCode')).toBe('WXYZ');

    expect(form.classList.contains('hidden')).toBe(true);
    expect(document.querySelector('.js-joined').classList.contains('hidden')).toBe(false);
  });

  test('create game button should emit "createGame" event', () => {
    const createButton = document.querySelector('.js-create-game');
    document.querySelector('[name=name]').value = 'Creator'; // Ensure name is set
    document.querySelector('[name=team]').value = 'HostTeam'; // Ensure team is set

    createButton.dispatchEvent(new Event('click'));

    expect(mockEmit).toHaveBeenCalledWith('createGame', {
      name: 'Creator',
      id: expect.any(Number),
    });
  });

  test('socket "gameCreated" event should redirect to host page', () => {
    // Find the handler for 'gameCreated' if it was registered
    const gameCreatedHandler = mockOn.mock.calls.find(call => call[0] === 'gameCreated');
    expect(gameCreatedHandler).toBeDefined();

    if (gameCreatedHandler) {
      gameCreatedHandler[1]({ gameCode: 'NEWGAME1' }); // Simulate server emitting the event
      expect(window.location.href).toBe('/host?game=NEWGAME1');
    }
  });

  test('buzzer click should emit "buzz" event', () => {
    // First, simulate joining a game to set currentGameCode
    const form = document.querySelector('.js-join');
    form.querySelector('[name=name]').value = 'BuzzerUser';
    form.querySelector('[name=team]').value = 'BuzzTeam';
    form.querySelector('[name=gameCode]').value = 'BUZZGM';
    form.dispatchEvent(new Event('submit')); // This sets currentGameCode
    mockEmit.mockClear(); // Clear emits from join

    const buzzerButton = document.querySelector('.js-buzzer');
    buzzerButton.dispatchEvent(new Event('click'));

    expect(mockEmit).toHaveBeenCalledWith('buzz', {
      user: expect.objectContaining({
        name: 'BuzzerUser',
        team: 'BuzzTeam',
      }),
      gameCode: 'BUZZGM',
    });
  });

   test('socket "error" event with "game not found" should reset UI', () => {
    // Simulate being in a joined state
    document.querySelector('.js-form').classList.add('hidden');
    document.querySelector('.js-joined').classList.remove('hidden');
    localStorage.setItem('currentGameCode', 'OLDGAME');

    const errorHandler = mockOn.mock.calls.find(call => call[0] === 'error');
    expect(errorHandler).toBeDefined();

    if (errorHandler) {
      errorHandler[1]({ message: 'Game not found.' }); // Simulate server error
      expect(document.querySelector('.js-form').classList.contains('hidden')).toBe(false);
      expect(document.querySelector('.js-joined').classList.contains('hidden')).toBe(true);
      expect(localStorage.getItem('currentGameCode')).toBeNull();
    }
  });

  // TODO: Test 'editInfo' click behavior
  // TODO: Test displayError utility function calls and timeout behavior
}); 