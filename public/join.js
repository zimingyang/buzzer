const socket = io()
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

const getUserInfo = () => {
  user = JSON.parse(localStorage.getItem('user')) || {}
  if (user.name) {
    form.querySelector('[name=name]').value = user.name
    form.querySelector('[name=team]').value = user.team
  }
  currentGameCode = localStorage.getItem('currentGameCode')
  if (currentGameCode) {
    if (gameCodeDisplay) gameCodeDisplay.textContent = `Game Code: ${currentGameCode}`
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
  user.name = form.querySelector('[name=name]').value
  user.team = form.querySelector('[name=team]').value
  const inputGameCode = form.querySelector('[name=gameCode]').value.toUpperCase()

  if (!user.name || !user.team || !inputGameCode) {
    displayError("Name, team, and game code are required to join.")
    return
  }

  if (!user.id) {
    user.id = Math.floor(Math.random() * new Date().getTime())
  }

  currentGameCode = inputGameCode
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
    
    if (!user.id) {
      user.id = Math.floor(Math.random() * new Date().getTime())
    }
    socket.emit('createGame', { name: user.name, id: user.id })
    saveUserInfo()
  })
}

socket.on('gameCreated', (data) => {
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

socket.on('connect', () => {
  console.log('Socket connected:', socket.id)
})

socket.on('disconnect', (reason) => {
  console.log('Socket disconnected:', reason)
  displayError('Disconnected from server. Please check your connection and refresh.')
})

getUserInfo()
