const socket = io()
const activeUsersList = document.querySelector('.js-active-users')
const buzzList = document.querySelector('.js-buzzes')
const clear = document.querySelector('.js-clear')
const scoresList = document.querySelector('.scores-list')

// Templates
const buzzTemplate = document.querySelector('#buzz-template')
const scoreTemplate = document.querySelector('#score-template')
const userTemplate = document.querySelector('#user-template')

// Get gameCode from URL
const urlParams = new URLSearchParams(window.location.search);
const gameCode = urlParams.get('game');

if (!gameCode) {
  // Handle missing game code, maybe redirect or show error
  activeUsersList.innerHTML = "<li>No game code specified in URL.</li>";
  // Disable buttons if no gamecode
  if(clear) clear.disabled = true;
} else {
  // Tell the server that the host for this gameCode has loaded the page
  socket.emit('hostLoaded', { gameCode });
}

// Update active users list when received from server
socket.on('active', (users) => {
  // Debug what's being received
  console.log('Active users received:', users);
  
  // Clear existing users list
  activeUsersList.innerHTML = '';
  
  if (!users || users.length === 0) {
    activeUsersList.innerHTML = '<li>No users joined yet</li>';
    return;
  }
  
  // Add each user to the list
  users.forEach(user => {
    if (!user || !user.name) {
      console.log('Invalid user data:', user);
      return; // Skip invalid users
    }
    
    // Clone the template
    const template = userTemplate.content.cloneNode(true);
    const li = template.querySelector('.user-item');
    const span = template.querySelector('.user-name');
    
    // Set user data
    span.textContent = `${user.name} - Team ${user.team || 'Unknown'}`;
    
    // Add to list
    activeUsersList.appendChild(template);
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
  if (scoresList) {
    // Clear existing scores
    scoresList.innerHTML = '';
    
    // Add new scores using the template
    for (const team in scores) {
      const template = scoreTemplate.content.cloneNode(true);
      const li = template.querySelector('li');
      li.textContent = `Team ${team}: ${scores[team]}`;
      scoresList.appendChild(template);
    }
  } else {
    console.log('Scores updated:', scores); // Fallback if no display element
  }
});

// Set up clear button event handler
clear.addEventListener('click', () => {
  if (!gameCode) return;
  socket.emit('clear', gameCode);
})

