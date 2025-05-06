const socket = io()
const active = document.querySelector('.js-active')
const buzzList = document.querySelector('.js-buzzes')
const clear = document.querySelector('.js-clear')
const scoresDisplay = document.querySelector('.js-scores')

// Get gameCode from URL
const urlParams = new URLSearchParams(window.location.search);
const gameCode = urlParams.get('game');

if (!gameCode) {
  // Handle missing game code, maybe redirect or show error
  active.innerText = "No game code specified in URL.";
  // Disable buttons if no gamecode
  if(clear) clear.disabled = true;
} else {
  // Optional: Display the game code on the host page
  const gameCodeDisplay = document.createElement('p');
  gameCodeDisplay.textContent = `Game Code: ${gameCode}`;
  document.body.insertBefore(gameCodeDisplay, document.body.firstChild);
  
  // Tell the server that the host for this gameCode has loaded the page
  socket.emit('hostLoaded', { gameCode });
}

socket.on('active', (numberActive) => {
  active.innerText = `${numberActive} joined`
})

socket.on('buzzes', (buzzes) => {
  buzzList.innerHTML = buzzes
    .map(user => 
      `<li>${user.name} on Team ${user.team} 
         <button class="award-point-btn" data-team="${user.team}">Award Point to Team ${user.team}</button>
       </li>`)
    .join('');

  // Add event listeners to new award buttons
  document.querySelectorAll('.award-point-btn').forEach(button => {
    button.addEventListener('click', () => {
      if (!gameCode) return;
      const teamName = button.dataset.team;
      socket.emit('awardPoint', { teamName, gameCode });
    });
  });
})

// Listen for score updates
socket.on('scores', (scores) => {
  if (scoresDisplay) {
    scoresDisplay.innerHTML = '<h3>Scores:</h3>';
    const ul = document.createElement('ul');
    for (const team in scores) {
      const li = document.createElement('li');
      li.textContent = `Team ${team}: ${scores[team]}`;
      ul.appendChild(li);
    }
    scoresDisplay.appendChild(ul);
  } else {
    console.log('Scores updated:', scores); // Fallback if no display element
  }
});

clear.addEventListener('click', () => {
  if (!gameCode) return;
  socket.emit('clear', gameCode) // Send gameCode with clear event
})

