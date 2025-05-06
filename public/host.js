const socket = io()
const active = document.querySelector('.js-active')
const buzzList = document.querySelector('.js-buzzes')
const clear = document.querySelector('.js-clear')
const scoresList = document.querySelector('.scores-list')

// Templates
const buzzTemplate = document.querySelector('#buzz-template')
const scoreTemplate = document.querySelector('#score-template')

// Get gameCode from URL
const urlParams = new URLSearchParams(window.location.search);
const gameCode = urlParams.get('game');

if (!gameCode) {
  // Handle missing game code, maybe redirect or show error
  active.innerText = "No game code specified in URL.";
  // Disable buttons if no gamecode
  if(clear) clear.disabled = true;
} else {
  // Tell the server that the host for this gameCode has loaded the page
  socket.emit('hostLoaded', { gameCode });
}

// Update active user count when received from server
socket.on('active', (numberActive) => {
  active.innerText = `${numberActive} joined`;
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

