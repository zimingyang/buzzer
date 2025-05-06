/**
 * @jest-environment jsdom
 */

const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock Socket.IO client
const mockEmit = jest.fn();
const mockOn = jest.fn(); // Each client (host, join) would have its own 'on' mock typically
const mockSocket = {
  on: mockOn,
  emit: mockEmit,
  id: 'testHostSocketId456',
};
const mockIo = jest.fn(() => mockSocket);
global.io = mockIo;

// Mock URLSearchParams
global.URLSearchParams = class {
  constructor(search) {
    this.search = search;
    this.params = new Map();
    if (search) {
      const pairs = search.substring(1).split('&');
      for (const pair of pairs) {
        const parts = pair.split('=');
        this.params.set(decodeURIComponent(parts[0]), decodeURIComponent(parts[1] || ''));
      }
    }
  }
  get(key) {
    return this.params.get(key) || null;
  }
};


describe('Host Page Logic (public/host.js)', () => {
  beforeEach(() => {
    mockEmit.mockClear();
    mockOn.mockClear();
    mockIo.mockClear();

    // Set up basic HTML structure expected by host.js
    document.body.innerHTML = `
      <div class="js-active">0 joined</div>
      <ul class="js-buzzes"></ul>
      <button class="js-clear">Clear Buzzes</button>
      <div class="js-scores"></div>
    `;

    // Mock window.location.search to simulate URL parameters
    // JSDOM doesn't fully support navigation, so we mock parts of window.location
    Object.defineProperty(window, 'location', {
      value: {
        search: '?game=TESTGAME', // Default game code for tests
      },
      writable: true,
    });

    // Require host.js after DOM and mocks are set up
    require('./public/host.js');
  });

  test('should display game code from URL and initialize UI', () => {
    expect(document.body.innerHTML).toContain('Game Code: TESTGAME');
    expect(document.querySelector('.js-active').innerText).toBe('No game code specified in URL.'); // Initial before socket connect
    // Note: The actual script might run and overwrite this immediately.
    // The test for 'active' event will be more reliable for socket updates.
  });

  test('socket "active" event should update active user count', () => {
    const activeHandler = mockOn.mock.calls.find(call => call[0] === 'active');
    expect(activeHandler).toBeDefined();
    if (activeHandler) {
      activeHandler[1](5); // Simulate server emitting active user count
      expect(document.querySelector('.js-active').innerText).toBe('5 joined');
    }
  });

  test('socket "buzzes" event should update buzz list and add award buttons', () => {
    const buzzesHandler = mockOn.mock.calls.find(call => call[0] === 'buzzes');
    expect(buzzesHandler).toBeDefined();

    if (buzzesHandler) {
      const buzzes = [{ name: 'Player1', team: 'Alpha' }, { name: 'Player2', team: 'Beta' }];
      buzzesHandler[1](buzzes); // Simulate server emitting buzzes

      const buzzListItems = document.querySelectorAll('.js-buzzes li');
      expect(buzzListItems.length).toBe(2);
      expect(buzzListItems[0].textContent).toContain('Player1 on Team Alpha');
      expect(buzzListItems[0].querySelector('button.award-point-btn')).not.toBeNull();
      expect(buzzListItems[0].querySelector('button.award-point-btn').dataset.team).toBe('Alpha');

      // Test clicking an award button
      const awardButton = buzzListItems[0].querySelector('button.award-point-btn');
      awardButton.dispatchEvent(new Event('click'));
      expect(mockEmit).toHaveBeenCalledWith('awardPoint', { teamName: 'Alpha', gameCode: 'TESTGAME' });
    }
  });

  test('clear button click should emit "clear" event with gameCode', () => {
    const clearButton = document.querySelector('.js-clear');
    clearButton.dispatchEvent(new Event('click'));
    expect(mockEmit).toHaveBeenCalledWith('clear', 'TESTGAME');
  });

  test('socket "scores" event should update scores display', () => {
    const scoresHandler = mockOn.mock.calls.find(call => call[0] === 'scores');
    expect(scoresHandler).toBeDefined();

    if (scoresHandler) {
      const scores = { Alpha: 1, Beta: 2 };
      scoresHandler[1](scores);

      const scoresDisplay = document.querySelector('.js-scores');
      expect(scoresDisplay.innerHTML).toContain('<h3>Scores:</h3>');
      expect(scoresDisplay.textContent).toContain('Team Alpha: 1');
      expect(scoresDisplay.textContent).toContain('Team Beta: 2');
    }
  });

  describe('Host page without gameCode in URL', () => {
    beforeEach(() => {
        // Override window.location.search for this specific describe block
        Object.defineProperty(window, 'location', {
            value: {
                search: '', // No game code
            },
            writable: true,
        });
        document.body.innerHTML = `
            <div class="js-active">0 joined</div>
            <ul class="js-buzzes"></ul>
            <button class="js-clear">Clear Buzzes</button>
            <div class="js-scores"></div>
        `;
        // Re-require host.js to apply the new URL search parameter
        // Need to be careful with Jest's module caching. A more robust way is to
        // export an init function from host.js or structure it as a class.
        // For simplicity here, we rely on Jest re-evaluating if possible or accept limitations.
        // Best practice: modularize host.js more for testability.
        jest.resetModules(); // This will clear the cache for all modules
        global.io = jest.fn(() => mockSocket); // Re-mock io as it gets reset by jest.resetModules()
        require('./public/host.js');
    });

    test('should display "No game code" message and disable clear button', () => {
        expect(document.querySelector('.js-active').innerText).toBe('No game code specified in URL.');
        const clearButton = document.querySelector('.js-clear');
        expect(clearButton.disabled).toBe(true);
    });

    test('award point button click should not emit if no gameCode', () => {
        // Simulate a buzz to create an award button
        const buzzesHandler = mockOn.mock.calls.find(call => call[0] === 'buzzes');
        if (buzzesHandler) {
            buzzesHandler[1]([{ name: 'Test', team: 'Gamma' }]);
            const awardButton = document.querySelector('.award-point-btn');
            expect(awardButton).not.toBeNull();
            awardButton.dispatchEvent(new Event('click'));
            expect(mockEmit).not.toHaveBeenCalledWith('awardPoint', expect.anything());
        }
    });
  });

}); 