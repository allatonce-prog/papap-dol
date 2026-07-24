// ============================================================
//  PAPAP DOL — Lobby Module
// ============================================================
import { appState, showScreen } from './main.js';
import { SCREEN, PLAYER_COLORS, PLAYER_AVATARS, MAPS, TILE_SIZE, SPAWN_POSITIONS } from './utils/constants.js';
import {
  watchRoom, updateRoom, updatePlayer, removePlayer,
  deleteRoom, setGameStatus, sendChatMessage, watchChat,
} from './firebase.js';
import { sfxCountdownBeep, sfxJoin } from './game/Audio.js';
import { GameManager } from './game/GameManager.js';

let _unsubLobby = null;
let _unsubChat  = null;
let _gameManager = null;

// ── Init ──────────────────────────────────────────────────────
export function initLobby() {
  document.getElementById('btn-lobby-leave').addEventListener('click', handleLeave);

  // Copy room code
  document.getElementById('lobby-room-code').addEventListener('click', () => {
    navigator.clipboard?.writeText(appState.roomId)
      .then(() => showToast('Room code copied!'))
      .catch(() => { });
  });

  // Lobby Chat form
  const chatForm = document.getElementById('lobby-chat-form');
  const chatInput = document.getElementById('lobby-chat-input');
  const sendBtn = document.getElementById('btn-lobby-chat-send');

  const onSendMsg = () => {
    const text = chatInput.value.trim();
    if (!text || !appState.roomId) return;
    chatInput.value = '';
    const room = appState.roomData;
    const colorIndex = room?.players?.[appState.playerId]?.colorIndex ?? 0;
    const color = PLAYER_COLORS[colorIndex];
    sendChatMessage(appState.roomId, {
      sender: appState.nickname || 'Guest',
      text: text,
      color: color,
    }).catch(() => {});
  };

  chatForm.addEventListener('submit', e => {
    e.preventDefault();
    onSendMsg();
  });
  sendBtn.addEventListener('click', onSendMsg);

  // Observe lobby screen becoming visible
  const lobbyScreen = document.getElementById(SCREEN.LOBBY);
  const observer = new MutationObserver(() => {
    if (!lobbyScreen.classList.contains('hidden')) {
      startLobbyWatch();
    } else {
      stopLobbyWatch();
    }
  });
  observer.observe(lobbyScreen, { attributes: true, attributeFilter: ['class'] });

  // Winner screen buttons
  document.getElementById('btn-winner-again').addEventListener('click', handlePlayAgain);
  document.getElementById('btn-winner-lobby').addEventListener('click', handleReturnLobby);
}

// ── Watch ─────────────────────────────────────────────────────
function startLobbyWatch() {
  if (_unsubLobby) return;
  _unsubLobby = watchRoom(appState.roomId, handleRoomUpdate);
  startChatWatch();
}

function stopLobbyWatch() {
  if (_unsubLobby) { _unsubLobby(); _unsubLobby = null; }
  stopChatWatch();
}

function startChatWatch() {
  if (_unsubChat) return;
  const messagesDiv = document.getElementById('lobby-chat-messages');
  messagesDiv.innerHTML = '';
  _unsubChat = watchChat(appState.roomId, chatData => {
    const list = Object.values(chatData || {}).sort((a,b) => (a.timestamp||0) - (b.timestamp||0));
    messagesDiv.innerHTML = list.map(m => `
      <div class="lobby-chat-msg">
        <span class="chat-name" style="color:${m.color || '#fff'}">${escHtml(m.sender)}:</span>
        <span class="chat-text">${escHtml(m.text)}</span>
      </div>
    `).join('');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

function stopChatWatch() {
  if (_unsubChat) { _unsubChat(); _unsubChat = null; }
}

function handleRoomUpdate(room) {
  if (!room) {
    // Room deleted (host left)
    alert('The room was closed by the host.');
    showScreen(SCREEN.MENU);
    return;
  }

  appState.roomData = room;

  // Check for host change
  if (room.hostId === appState.playerId) {
    appState.isHost = true;
  }

  // Handle disconnected host reassignment
  if (room.disconnectedHost && appState.isHost) {
    updateRoom(appState.roomId, { disconnectedHost: null });
  }

  // If game started, enter game
  if (room.status === 'playing' || room.status === 'countdown') {
    if (document.getElementById(SCREEN.LOBBY) &&
      !document.getElementById(SCREEN.LOBBY).classList.contains('hidden')) {
      startCountdownAndGame(room);
    }
    return;
  }

  // If game finished, show winner
  if (room.status === 'finished' && room.winner) {
    showWinnerScreen(room.winner);
    return;
  }

  renderLobby(room);
}

// ── Render Lobby ──────────────────────────────────────────────
function renderLobby(room) {
  document.getElementById('lobby-room-name').textContent = room.roomName || 'Room';
  document.getElementById('lobby-map-badge').textContent = `🗺️ ${room.map || 'Classic'}`;
  document.getElementById('lobby-room-code').textContent = `📋 ${appState.roomId}`;

  const playersMap = room.players || {};
  const playerList = Object.entries(playersMap)
    .sort(([, a], [, b]) => (a.joinedAt || 0) - (b.joinedAt || 0));
  const isHost = room.hostId === appState.playerId;
  const maxP = room.maxPlayers || 4;

  // Player grid
  const grid = document.getElementById('lobby-players-grid');
  grid.innerHTML = '';

  for (let i = 0; i < maxP; i++) {
    const slot = document.createElement('div');
    if (i < playerList.length) {
      const [pid, p] = playerList[i];
      const isMe = pid === appState.playerId;
      const isReady = p.ready;
      const isRoomHost = pid === room.hostId;
      slot.className = `lobby-player-card${isReady ? ' ready' : ''}`;
      slot.innerHTML = `
        ${isRoomHost ? '<div class="host-badge">👑 HOST</div>' : ''}
        <div class="player-avatar" style="background:${p.color}22;border:2px solid ${p.color}">
          ${p.avatar || '🙂'}
        </div>
        <div class="player-info">
          <div class="player-nick" style="color:${p.color}">${escHtml(p.nickname)}</div>
          <div class="player-role">${isMe ? '(YOU)' : ''}</div>
        </div>
        <div class="ready-badge">${isReady ? '✅' : '❌'}</div>
        ${isHost && !isMe ? `<button class="kick-btn" onclick="window._kickPlayer('${pid}')">KICK</button>` : ''}
      `;
    } else {
      slot.className = 'lobby-player-card waiting-slot';
      slot.innerHTML = `<span style="font-size:var(--font-size-xs);color:var(--text-muted)">Waiting...</span>`;
    }
    grid.appendChild(slot);
  }

  // Controls
  const controls = document.getElementById('lobby-controls');
  controls.innerHTML = '';
  const myPlayer = playersMap[appState.playerId];
  const allCount = playerList.length;
  const readyCount = playerList.filter(([, p]) => p.ready).length;

  if (isHost) {
    // Map picker
    const mapSel = document.createElement('select');
    mapSel.className = 'neon-select';
    mapSel.style.maxWidth = '130px';
    MAPS.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m;
      if (m === room.map) opt.selected = true;
      mapSel.appendChild(opt);
    });
    mapSel.addEventListener('change', () => updateRoom(appState.roomId, { map: mapSel.value }));
    controls.appendChild(mapSel);

    const startBtn = document.createElement('button');
    startBtn.className = 'btn btn-primary';
    startBtn.id = 'btn-lobby-start';
    const canStart = allCount >= 1;
    startBtn.disabled = !canStart;
    startBtn.textContent = canStart
      ? `▶ START (${readyCount}/${allCount} ready)`
      : `WAITING FOR PLAYERS...`;
    startBtn.addEventListener('click', handleStartGame);
    controls.appendChild(startBtn);
  } else {
    const readyBtn = document.createElement('button');
    readyBtn.className = `btn ${myPlayer?.ready ? 'btn-green' : 'btn-primary'}`;
    readyBtn.textContent = myPlayer?.ready ? '✅ READY' : '⏳ NOT READY';
    readyBtn.addEventListener('click', () => {
      const newReady = !(myPlayer?.ready);
      updatePlayer(appState.roomId, appState.playerId, { ready: newReady });
    });
    controls.appendChild(readyBtn);
  }

  const hint = document.getElementById('lobby-hint');
  hint.textContent = isHost
    ? `${readyCount} of ${allCount} ready. You can start solo or wait for more players.`
    : 'Click READY when you\'re prepared to play!';
}

// ── Kick ──────────────────────────────────────────────────────
window._kickPlayer = async (pid) => {
  if (!appState.isHost) return;
  await removePlayer(appState.roomId, pid);
};

// ── Start Game ────────────────────────────────────────────────
async function handleStartGame() {
  if (!appState.isHost) return;
  const room = appState.roomData;
  const players = room.players || {};
  const playerList = Object.keys(players);
  const maxP = room.maxPlayers || 4;

  const updates = {
    status: 'countdown',
    mapSeed: Math.floor(Math.random() * 999999)
  };

  // If there are fewer players than maxPlayers, fill the remaining slots with bots!
  const botNames = ['Bot Bob', 'Bot Rob', 'Bot Cob', 'Bot Job'];
  const botAvatars = ['🤖', '👾', '👽', '💀'];
  
  let botCount = 0;
  for (let i = 0; i < maxP; i++) {
    const usedColorIndices = new Set(Object.values(players).map(p => p.colorIndex));
    if (playerList.length + botCount < maxP) {
      // Find the first free colorIndex
      let colorIndex = 0;
      for (let c = 0; c < maxP; c++) {
        if (!usedColorIndices.has(c)) {
          colorIndex = c;
          usedColorIndices.add(c);
          break;
        }
      }
      
      const spawn = SPAWN_POSITIONS[colorIndex] || SPAWN_POSITIONS[0];
      const botId = `bot_${Date.now()}_${colorIndex}`;
      updates[`players/${botId}`] = {
        nickname: botNames[colorIndex] || 'Bot',
        colorIndex: colorIndex,
        color: PLAYER_COLORS[colorIndex],
        avatar: botAvatars[colorIndex] || '🤖',
        alive: true,
        px: spawn.x * TILE_SIZE + TILE_SIZE / 2,
        py: spawn.y * TILE_SIZE + TILE_SIZE / 2,
        direction: 'down',
        speed: 130, // Bot moves slightly slower
        bombCapacity: 1,
        explosionRange: 1,
        shield: false,
        canKick: false,
        remoteDetonator: false,
        canGhost: false,
        extraLives: 0,
        ready: true,
        isBot: true,
        joinedAt: Date.now() + colorIndex
      };
      botCount++;
    }
  }

  await updateRoom(appState.roomId, updates);
}

// ── Countdown & Game Start ─────────────────────────────────────
let _countdownRunning = false;
async function startCountdownAndGame(room) {
  if (_countdownRunning) return;
  _countdownRunning = true;
  stopLobbyWatch();

  const overlay = document.getElementById('countdown-overlay');
  const display = document.getElementById('countdown-display');
  overlay.classList.add('visible');

  const steps = ['3', '2', '1', 'GO!'];
  for (let i = 0; i < steps.length; i++) {
    display.innerHTML = `<div class="${i < 3 ? 'countdown-number' : 'countdown-go'}">${steps[i]}</div>`;
    sfxCountdownBeep(i === 3);
    await sleep(900);
  }

  overlay.classList.remove('visible');
  _countdownRunning = false;

  // Launch game
  showScreen(SCREEN.GAME);
  if (_gameManager) _gameManager.destroy();
  _gameManager = new GameManager(appState.roomId, appState.playerId, appState.isHost, room);
  _gameManager.start();
}

// ── Winner Screen ─────────────────────────────────────────────
export function showWinnerScreen(winnerNick) {
  if (_gameManager) { _gameManager.destroy(); _gameManager = null; }
  document.getElementById('winner-name-display').textContent = winnerNick;
  showScreen(SCREEN.WINNER);
  startConfetti();
  import('./game/Audio.js').then(m => { if (m.sfxVictory) m.sfxVictory(); }).catch(() => { });
}

async function handlePlayAgain() {
  stopConfetti();
  if (appState.isHost && appState.roomId) {
    const room = appState.roomData;
    const newSeed = Math.floor(Math.random() * 999999);
    // Reset all player alive status, and delete bots
    const updates = {};
    const players = room?.players || {};
    Object.keys(players).forEach(pid => {
      if (pid.startsWith('bot_')) {
        updates[`players/${pid}`] = null; // delete bot
      } else {
        updates[`players/${pid}/alive`] = true;
        updates[`players/${pid}/ready`] = false;
        updates[`players/${pid}/bombCapacity`] = 3; // start with 3
        updates[`players/${pid}/explosionRange`] = 1;
        updates[`players/${pid}/speed`] = 180;
        updates[`players/${pid}/shield`] = false;
      }
    });
    updates.status = 'waiting';
    updates.winner = null;
    updates.mapSeed = newSeed;
    updates.bombs = null;
    updates.powerUps = null;
    updates.destroyedCrates = null;
    await updateRoom(appState.roomId, updates);
  }
  showScreen(SCREEN.LOBBY);
  startLobbyWatch();
}

async function handleReturnLobby() {
  stopConfetti();
  await handleLeave();
}

// ── Leave ─────────────────────────────────────────────────────
async function handleLeave() {
  stopLobbyWatch();
  if (_gameManager) { _gameManager.destroy(); _gameManager = null; }

  if (!appState.roomId) { showScreen(SCREEN.MENU); return; }

  try {
    if (appState.isHost) {
      // Reassign host or delete room
      const room = await import('./firebase.js').then(m => m.getRoom(appState.roomId));
      const players = room?.players || {};
      const others = Object.keys(players).filter(p => p !== appState.playerId);
      if (others.length > 0) {
        const newHostId = others.sort((a, b) => (players[a].joinedAt || 0) - (players[b].joinedAt || 0))[0];
        await updateRoom(appState.roomId, { hostId: newHostId });
        await removePlayer(appState.roomId, appState.playerId);
      } else {
        await deleteRoom(appState.roomId);
      }
    } else {
      await removePlayer(appState.roomId, appState.playerId);
    }
  } catch { /* ignore */ }

  appState.roomId = null;
  appState.isHost = false;
  appState.roomData = null;
  showScreen(SCREEN.MENU);
}

// ── Confetti ──────────────────────────────────────────────────
let _confettiId = null;
function startConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = Array.from({ length: 80 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height - canvas.height,
    w: 8 + Math.random() * 8,
    h: 4 + Math.random() * 6,
    color: ['#e94560', '#00d4ff', '#44ff88', '#ffcc00', '#ff6600'][Math.floor(Math.random() * 5)],
    vx: (Math.random() - 0.5) * 2,
    vy: 2 + Math.random() * 3,
    rot: Math.random() * 360,
    rotV: (Math.random() - 0.5) * 5,
  }));

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy; p.rot += p.rotV;
      if (p.y > canvas.height) { p.y = -20; p.x = Math.random() * canvas.width; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    _confettiId = requestAnimationFrame(draw);
  }
  draw();
}

function stopConfetti() {
  if (_confettiId) { cancelAnimationFrame(_confettiId); _confettiId = null; }
  const ctx = document.getElementById('confetti-canvas')?.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, 99999, 99999);
}

// ── Helpers ───────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'pu-toast show';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
