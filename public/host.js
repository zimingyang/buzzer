document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('theme-toggle');
  const body = document.body;

  // Function to apply the saved theme or default to light
  const applyTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      body.classList.add('dark-mode');
    } else {
      body.classList.remove('dark-mode'); // Default to light
    }
  };

  // Apply theme on initial load
  applyTheme();

  // Event listener for the toggle button
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      body.classList.toggle('dark-mode');
      // Save the new theme preference
      if (body.classList.contains('dark-mode')) {
        localStorage.setItem('theme', 'dark');
      } else {
        localStorage.setItem('theme', 'light');
      }
    });
  }
});

// Get the user info from localStorage to pass with socket connection
const storedUser = JSON.parse(localStorage.getItem('user')) || {};
// Initialize socket with user data
const socket = io({
  query: {
    user: JSON.stringify(storedUser)
  }
});

const teamStatsTable = document.querySelector('.team-stats')
const buzzList = document.querySelector('.js-buzzes')
const clear = document.querySelector('.js-clear')

// Templates
const buzzTemplate = document.querySelector('#buzz-template')
const scoreTemplate = document.querySelector('#score-template')
const userTemplate = document.querySelector('#user-template')

// Get gameCode from URL
const urlParams = new URLSearchParams(window.location.search);
const gameCode = urlParams.get('game');

// Store the host status in localStorage
if (gameCode) {
  localStorage.setItem('currentGameCode', gameCode);
  // Get existing user info to ensure host name is saved
  const user = JSON.parse(localStorage.getItem('user')) || {};
  if (!user.name) {
    user.name = 'Host';
    user.team = 'N/A';
    localStorage.setItem('user', JSON.stringify(user));
  }
}

if (!gameCode) {
  // Handle missing game code, maybe redirect or show error
  const usersRow = document.createElement('tr');
  usersRow.innerHTML = "<td colspan='2'>No game code specified in URL.</td>";
  teamStatsTable.appendChild(usersRow);
  // Disable buttons if no gamecode
  if(clear) clear.disabled = true;
} else {
  // Tell the server that the host for this gameCode has loaded the page
  socket.emit('hostLoaded', { gameCode });
}

// Handle reconnection
socket.on('connect', () => {
  console.log('Host socket connected:', socket.id);
  
  // If we have a game code, re-join that game's room
  if (gameCode) {
    socket.emit('hostLoaded', { gameCode });
  }
});

socket.on('disconnect', (reason) => {
  console.log('Host socket disconnected:', reason);
  // Store disconnect timestamp
  localStorage.setItem('disconnectedAt', Date.now().toString());
});

// Update active users list when received from server
socket.on('active', (users) => {
  // Debug what's being received
  console.log('Active users received:', users);
  
  // Remove existing user rows
  const userRows = teamStatsTable.querySelectorAll('.user-item');
  userRows.forEach(row => row.remove());
  
  if (!users || users.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.className = 'user-item';
    emptyRow.innerHTML = '<td colspan="2">No players joined yet</td>';
    teamStatsTable.appendChild(emptyRow);
    return;
  }
  
  // Add each user to the table
  users.forEach(user => {
    if (!user || !user.name) {
      console.log('Invalid user data:', user);
      return; // Skip invalid users
    }
    
    // Clone the template
    const template = userTemplate.content.cloneNode(true);
    const tr = template.querySelector('.user-item');
    const td = template.querySelector('.user-name');
    
    // Set user data
    td.textContent = `${user.name} - Team ${user.team || 'Unknown'}`;
    
    // Add to table
    teamStatsTable.appendChild(template);
  });
})

// Update buzz list when received from server
socket.on('buzzes', (buzzes) => {
  // Clear existing buzzes
  buzzList.innerHTML = '';
  
  // Add new buzzes using the template
  buzzes.forEach(user => {
    // Clone the template
    const template = buzzTemplate.content.cloneNode(true);
    const li = template.querySelector('li');
    const span = template.querySelector('.buzz-name');
    const button = template.querySelector('.award-point-btn');
    
    // Set data and content
    li.setAttribute('data-team', user.team);
    span.textContent = `${user.name} on Team ${user.team}`;
    button.setAttribute('data-team', user.team);
    button.textContent = `Award Point to Team ${user.team}`;
    
    // Add event listener
    button.addEventListener('click', () => {
      if (!gameCode) return;
      socket.emit('awardPoint', { teamName: user.team, gameCode });
    });
    
    // Add to list
    buzzList.appendChild(template);
  });
})

// Listen for score updates
socket.on('scores', (scores) => {
  // Remove existing team rows from the table
  const teamRows = teamStatsTable.querySelectorAll('.team-row');
  teamRows.forEach(row => row.remove());
  
  // Get the "Joined Users" header row to use as reference
  const joinedUsersHeader = Array.from(teamStatsTable.querySelectorAll('tr')).find(
    row => row.textContent.includes('Joined Users')
  );
  
  // Add new scores using the template
  for (const team in scores) {
    const template = scoreTemplate.content.cloneNode(true);
    const tr = template.querySelector('.team-row');
    const tds = tr.querySelectorAll('td');
    
    tr.setAttribute('data-team', team);
    tds[0].textContent = `Team ${team}`;
    tds[1].textContent = scores[team];
    
    // Insert before the joined users header
    if (joinedUsersHeader) {
      teamStatsTable.insertBefore(template, joinedUsersHeader);
    } else {
      teamStatsTable.insertBefore(template, teamStatsTable.firstChild);
    }
  }
});

// Set up clear button event handler
clear.addEventListener('click', () => {
  if (!gameCode) return;
  socket.emit('clear', gameCode);
})

