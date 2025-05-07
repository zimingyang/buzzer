// Get user info from localStorage first
const storedUser = JSON.parse(localStorage.getItem('user')) || {};
// Initialize socket with user data
const socket = io({
  query: {
    user: JSON.stringify(storedUser)
  }
});

const body = document.querySelector('.js-body')
const form = document.querySelector('.js-join')
const joined = document.querySelector('.js-joined')
const buzzer = document.querySelector('.js-buzzer')
const joinedInfo = document.querySelector('.js-joined-info')
const editInfo = document.querySelector('.js-edit')
const createGameBtn = document.querySelector('.js-create-game')
const gameCodeDisplay = document.querySelector('.js-game-code-display')
const errorMessageDisplay = document.querySelector('.js-error-message')

let user = {}
let currentGameCode = null

// Generate a truly unique ID based on timestamp and random number
const generateUniqueId = () => {
  return `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

const getUserInfo = () => {
  user = JSON.parse(localStorage.getItem('user')) || {}
  if (user.name) {
    form.querySelector('[name=name]').value = user.name
    form.querySelector('[name=team]').value = user.team
  }
  currentGameCode = localStorage.getItem('currentGameCode')
  if (currentGameCode) {
    if (gameCodeDisplay) gameCodeDisplay.textContent = `Game Code: ${currentGameCode}`
    
    // Auto-fill game code if available
    const gameCodeInput = form.querySelector('[name=gameCode]')
    if (gameCodeInput && currentGameCode) {
      gameCodeInput.value = currentGameCode
    }
  }
}

const saveUserInfo = () => {
  localStorage.setItem('user', JSON.stringify(user))
  if (currentGameCode) {
    localStorage.setItem('currentGameCode', currentGameCode)
  }
}

const displayError = (message) => {
  if (errorMessageDisplay) {
    errorMessageDisplay.textContent = message
    setTimeout(() => { errorMessageDisplay.textContent = '' }, 5000)
  } else {
    console.error(message)
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault()
  // Always generate a new ID for the user when they join a game
  // This ensures different people on the same browser get different IDs
  user.id = generateUniqueId()
  user.name = form.querySelector('[name=name]').value
  user.team = form.querySelector('[name=team]').value
  const inputGameCode = form.querySelector('[name=gameCode]').value.toUpperCase()

  if (!user.name || !user.team || !inputGameCode) {
    displayError("Name, team, and game code are required to join.")
    return
  }

  currentGameCode = inputGameCode
  console.log('Joining as:', user); // Debug log
  socket.emit('join', { user, gameCode: currentGameCode })
  saveUserInfo()
  
  joinedInfo.innerText = `${user.name} on Team ${user.team} (Game: ${currentGameCode})`
  if (gameCodeDisplay) gameCodeDisplay.textContent = `Game Code: ${currentGameCode}`
  form.classList.add('hidden')
  if (createGameBtn) createGameBtn.classList.add('hidden')
  joined.classList.remove('hidden')
  body.classList.add('buzzer-mode')
})

if (createGameBtn) {
  createGameBtn.addEventListener('click', () => {
    user.name = form.querySelector('[name=name]').value || 'Host'
    user.team = form.querySelector('[name=team]').value || 'N/A'
    user.id = generateUniqueId() // Generate a unique ID for the host
    
    console.log('Creating game as:', user); // Debug log
    socket.emit('createGame', user) // Send the whole user object
    saveUserInfo()
  })
}

socket.on('gameCreated', (data) => {
  currentGameCode = data.gameCode
  saveUserInfo()
  window.location.href = `/host?game=${currentGameCode}`
})

// Handle redirect to host page when a host reconnects
socket.on('redirectToHost', (data) => {
  currentGameCode = data.gameCode
  saveUserInfo()
  window.location.href = `/host?game=${currentGameCode}`
})

buzzer.addEventListener('click', (e) => {
  if (!currentGameCode) {
    displayError("Not connected to a game. Please join or create one.")
    return
  }
  socket.emit('buzz', { user, gameCode: currentGameCode })
})

editInfo.addEventListener('click', () => {
  joined.classList.add('hidden')
  form.classList.remove('hidden')
  if (createGameBtn) createGameBtn.classList.remove('hidden')
  body.classList.remove('buzzer-mode')
})

socket.on('error', (error) => {
  displayError(`Server error: ${error.message}`)
  if (error.message.toLowerCase().includes('game not found')) {
    joined.classList.add('hidden')
    form.classList.remove('hidden')
    if (createGameBtn) createGameBtn.classList.remove('hidden')
    body.classList.remove('buzzer-mode')
    currentGameCode = null
    localStorage.removeItem('currentGameCode')
    if (gameCodeDisplay) gameCodeDisplay.textContent = ''
  }
})

socket.on('disconnect', (reason) => {
  console.log('Socket disconnected:', reason)
  displayError('Disconnected from server. Please check your connection and refresh.')
  
  // Store disconnect timestamp to help with reconnection logic
  localStorage.setItem('disconnectedAt', Date.now().toString())
})

// Add reconnection handler to try rejoining the game
socket.on('connect', () => {
  console.log('Socket connected:', socket.id)
  
  // Check if we were disconnected and have necessary info to reconnect
  const disconnectedAt = localStorage.getItem('disconnectedAt')
  const savedUser = JSON.parse(localStorage.getItem('user')) || {}
  const savedGameCode = localStorage.getItem('currentGameCode')
  
  if (disconnectedAt && savedUser.name && savedGameCode) {
    // If it's been less than 5 minutes since disconnect, attempt to rejoin
    const timeElapsed = Date.now() - parseInt(disconnectedAt, 10)
    const FIVE_MINUTES = 5 * 60 * 1000
    
    if (timeElapsed <= FIVE_MINUTES) {
      console.log('Attempting auto-reconnect to game:', savedGameCode)
      
      // Create a user object with a new ID but same name
      const reconnectUser = {
        id: generateUniqueId(),
        name: savedUser.name,
        team: savedUser.team
      }
      
      // Update our current user
      user = reconnectUser
      
      // Show some status to the user
      displayError("Reconnecting to game...")
      
      // Attempt to rejoin the game
      socket.emit('join', { user: reconnectUser, gameCode: savedGameCode })
      
      // Also update UI to show joined state
      joinedInfo.innerText = `${user.name} on Team ${user.team} (Game: ${savedGameCode})`
      if (gameCodeDisplay) gameCodeDisplay.textContent = `Game Code: ${savedGameCode}`
      form.classList.add('hidden')
      if (createGameBtn) createGameBtn.classList.add('hidden')
      joined.classList.remove('hidden')
      body.classList.add('buzzer-mode')
      
      // Clear disconnect timestamp
      localStorage.removeItem('disconnectedAt')
    }
  }
})

getUserInfo()
