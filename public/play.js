document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  const params = new URLSearchParams(window.location.search);
  const gameCode = params.get('game');
  const userString = params.get('user');
  let currentUser = {};

  if (userString) {
    try {
      currentUser = JSON.parse(decodeURIComponent(userString));
    } catch (e) {
      console.error('Error parsing user data from URL:', e);
      // Redirect to home or show error if user data is corrupted
      document.querySelector('.js-error-message').textContent = 'Error loading player data. Please try rejoining.';
      return;
    }
  } else {
    document.querySelector('.js-error-message').textContent = 'Player data not found. Please try rejoining.';
    return;
  }

  const gameCodeDisplay = document.querySelector('.js-game-code');
  const playerCountDisplay = document.querySelector('.js-player-count');
  const playerNameDisplay = document.querySelector('.js-player-name');
  const playerTeamDisplay = document.querySelector('.js-player-team');
  const buzzButton = document.querySelector('.js-buzzer');
  const errorMessageDisplay = document.querySelector('.js-error-message');
  const themeToggleButton = document.getElementById('theme-toggle');
  const body = document.querySelector('.js-body');
  const editPlayButton = document.querySelector('.js-edit-play');


  if (gameCodeDisplay) gameCodeDisplay.textContent = gameCode || 'N/A';
  if (playerNameDisplay) playerNameDisplay.textContent = currentUser.name || 'Unknown';
  if (playerTeamDisplay) playerTeamDisplay.textContent = currentUser.team || 'Unknown';

  // Load theme from localStorage
  const currentTheme = localStorage.getItem('theme');
  if (currentTheme === 'dark') {
    body.classList.add('dark-theme');
  }

  if (themeToggleButton) {
    themeToggleButton.addEventListener('click', () => {
      body.classList.toggle('dark-theme');
      if (body.classList.contains('dark-theme')) {
        localStorage.setItem('theme', 'dark');
      } else {
        localStorage.setItem('theme', 'light');
      }
    });
  }

  // Emit event to signal that the play page has loaded for this user
  // This helps the server associate the socket with the user in this game context if needed
  // (e.g. if the user refreshed the page)
  socket.emit('playerLoaded', { gameCode, user: currentUser });


  if (buzzButton) {
    buzzButton.addEventListener('click', () => {
      console.log('Buzz button clicked by user:', currentUser);
      // Check if button is already disabled; if so, do nothing.
      if (buzzButton.disabled) {
          console.log('Buzz button clicked, but already disabled.');
          return;
      }

      if (gameCode && currentUser && currentUser.id) {
        socket.emit('buzz', { gameCode, user: currentUser });
        console.log('Buzz event emitted for:', currentUser.name);
        buzzButton.disabled = true; // Disable button immediately after this player buzzes
      } else {
        console.error('Cannot buzz. Game code or user info missing. User:', currentUser, 'GameCode:', gameCode);
        if (errorMessageDisplay) errorMessageDisplay.textContent = 'Cannot buzz. Game or user info missing.';
      }
    });
  }

  socket.on('connect', () => {
    console.log('Connected to server - Player view');
    // Re-emit playerLoaded if connection was lost and re-established.
    // socket.emit('playerLoaded', { gameCode, user: currentUser }); // Not strictly necessary if handshake handles it
  });
  
  socket.on('error', (data) => {
    console.error('Server error:', data.message);
    if (errorMessageDisplay) {
        errorMessageDisplay.textContent = data.message;
    }
    if (data.message.toLowerCase().includes('game has ended') || data.message.toLowerCase().includes('game not found')) {
        if(buzzButton) buzzButton.disabled = true;
        // Consider redirecting to home page or showing a more permanent message
        setTimeout(() => {
            // window.location.href = '/'; // Optional: redirect home
        }, 5000);
    }
  });

  socket.on('active', (users) => {
    console.log('Active users update:', users);
    if (playerCountDisplay) {
      playerCountDisplay.textContent = users.length;
    }
  });

  socket.on('buzzes', (buzzes) => {
    console.log('Buzzes update received by client:', buzzes);
    if (buzzButton) {
      // Only re-enable the button if the buzzes list is empty (cleared by host)
      if (buzzes.length === 0) {
        console.log('Buzzes cleared by host, re-enabling buzz button.');
        buzzButton.disabled = false;
      } else {
        // If the list is not empty, ensure the button remains disabled if this specific player has already buzzed
        // or if they haven't buzzed yet, keep it enabled unless it was already disabled by their own click.
        // The main disabling action is now in the click handler. This block primarily handles re-enabling.
        // For simplicity, if a player has buzzed (their button is disabled), and the list is not empty,
        // it will remain disabled. If they haven't buzzed, their button state won't be changed here unless it's a clear.
        // This ensures that once a player buzzes, only a full clear re-enables them.
        if (!buzzButton.disabled && buzzes.some(b => b.name === currentUser.name && b.team === currentUser.team)) {
            // This case is unlikely if click handler works, but as a safeguard:
            // If this player is in the buzz list and their button is somehow still enabled, disable it.
            console.log('This player is in the buzz queue, ensuring button is disabled.');
            buzzButton.disabled = true;
        } else if (buzzButton.disabled && buzzes.length > 0) {
            console.log('Buzzes list is not empty, and this player previously buzzed. Button remains disabled.');
        } else if (!buzzButton.disabled && buzzes.length > 0) {
            console.log('Buzzes list is not empty, but this player has not buzzed. Button remains enabled.');
        }
      }
    }
  });
  
  socket.on('scores', (scores) => {
    console.log('Scores update:', scores);
    // Player view might display scores, e.g. their team's score or all scores
    // For now, just logging. Implement UI update if needed.
  });

  // If the server detects this is a host and they landed on /play, redirect them
  socket.on('redirectToHost', (data) => {
    console.log('Received redirectToHost, redirecting to host page:', data.gameCode);
    window.location.href = `/host?game=${data.gameCode}&user=${encodeURIComponent(JSON.stringify(currentUser))}`;
  });

  // Handle game not found or other critical errors on load
  socket.on('connect_error', (err) => {
    console.error('Connection error:', err.message);
    errorMessageDisplay.textContent = 'Failed to connect to the game server. Please try again.';
  });
  
  socket.on('disconnect', (reason) => {
    console.log('Disconnected from server:', reason);
    errorMessageDisplay.textContent = 'Disconnected from server. Attempting to reconnect...';
    if(buzzButton) buzzButton.disabled = true;
  });

  if (editPlayButton) {
    editPlayButton.addEventListener('click', () => {
      // params is available from the top of the script
      const currentUrlGameCode = params.get('game');
      if (currentUrlGameCode) {
        localStorage.setItem('currentGameCode', currentUrlGameCode);
      }
      // Redirect to the home page, where join.js will prefill the game code
      window.location.href = '/'; 
    });
  }

});
