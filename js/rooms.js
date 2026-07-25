// ============================================================
//  PAPAP DOL — Room Browser & Create Room
// ============================================================
import { appState, showScreen } from './main.js';
import { SCREEN, PLAYER_COLORS, PLAYER_AVATARS, PLAYER_DARK, MAPS } from './utils/constants.js';
import { generateRoomName, generateRoomId } from './utils/names.js';
import {
  watchRooms, createRoom, joinRoom, getRoom,
  setupPresence, updateRoom,
} from './firebase.js';
import { sfxJoin } from './game/Audio.js';

let _unsubRooms = null;
let _allRooms   = {};
let _pendingJoinRoomId  = null;
let _pendingJoinRoomData= null;

// ── Init ──────────────────────────────────────────────────────
export function initRooms() {
  // Navigate to browse
  document.getElementById('btn-browse-rooms').addEventListener('click', openBrowse);
  document.getElementById('btn-create-room').addEventListener('click', () => showScreen(SCREEN.CREATE));
  document.getElementById('btn-browse-create').addEventListener('click', () => showScreen(SCREEN.CREATE));

  // Back buttons
  document.getElementById('btn-browse-back').addEventListener('click', () => showScreen(SCREEN.PLAY));
  document.getElementById('btn-create-back').addEventListener('click', () => showScreen(SCREEN.BROWSE));

  // Refresh
  document.getElementById('btn-browse-refresh').addEventListener('click', () => {
    if (_unsubRooms) { _unsubRooms(); _unsubRooms = null; }
    startWatchingRooms();
  });

  // Filters
  document.getElementById('room-search').addEventListener('input', renderRooms);
  document.getElementById('filter-hide-full').addEventListener('change', renderRooms);
  document.getElementById('filter-sort').addEventListener('change', renderRooms);

  // Create room
  document.getElementById('room-private').addEventListener('change', e => {
    document.getElementById('room-password-group').style.display = e.target.checked ? 'block' : 'none';
  });
  document.getElementById('btn-create-confirm').addEventListener('click', handleCreateRoom);

  // Password modal
  document.getElementById('btn-pw-cancel').addEventListener('click', () => {
    document.getElementById('password-modal').classList.remove('open');
    _pendingJoinRoomId = null;
  });
  document.getElementById('btn-pw-confirm').addEventListener('click', handlePasswordConfirm);
}

// ── Browse ─────────────────────────────────────────────────────
function openBrowse() {
  showScreen(SCREEN.BROWSE);
  startWatchingRooms();
}

function startWatchingRooms() {
  _unsubRooms = watchRooms(rooms => {
    _allRooms = rooms;
    renderRooms();
  });
}

function renderRooms() {
  const list     = document.getElementById('browse-rooms-list');
  const search   = document.getElementById('room-search').value.trim().toLowerCase();
  const hideFull = document.getElementById('filter-hide-full').checked;
  const sortBy   = document.getElementById('filter-sort').value;

  let entries = Object.entries(_allRooms)
    .filter(([, r]) => r && r.status === 'waiting')
    .filter(([, r]) => !search || r.roomName.toLowerCase().includes(search))
    .filter(([, r]) => !hideFull || Object.keys(r.players || {}).length < r.maxPlayers);

  // Sort
  if (sortBy === 'players') {
    entries.sort(([,a],[,b]) => Object.keys(b.players||{}).length - Object.keys(a.players||{}).length);
  } else if (sortBy === 'name') {
    entries.sort(([,a],[,b]) => a.roomName.localeCompare(b.roomName));
  } else if (sortBy === 'newest') {
    entries.sort(([,a],[,b]) => (b.createdAt||0) - (a.createdAt||0));
  }

  if (entries.length === 0) {
    list.innerHTML = `<div class="browse-empty"><p>💣</p><p>No rooms available.</p><p>Create one and invite friends!</p></div>`;
    return;
  }

  list.innerHTML = entries.map(([id, room]) => {
    const count = Object.keys(room.players || {}).length;
    const isFull= count >= room.maxPlayers;
    const isPrivate = room.private;
    return `
      <div class="room-card" data-room-id="${id}">
        <div class="room-card-info">
          <div class="room-name">${escHtml(room.roomName)} ${isPrivate ? '🔒' : ''}</div>
          <div class="room-meta">
            <span class="player-count">👥 ${count} / ${room.maxPlayers}</span>
            <span>🗺️ ${escHtml(room.map)}</span>
            <span style="color:var(--accent-green)">● Waiting</span>
          </div>
        </div>
        <button class="btn btn-sm ${isFull ? '' : 'btn-primary'}"
          data-room-id="${id}"
          ${isFull ? 'disabled' : ''}
          onclick="window._joinRoom('${id}')">
          ${isFull ? 'FULL' : 'JOIN →'}
        </button>
      </div>
    `;
  }).join('');
}

// ── Join Room ─────────────────────────────────────────────────
export async function joinRoomById(roomId) {
  try {
    const room = await getRoom(roomId);
    if (!room) {
      alert('Room not found or no longer exists.');
      showScreen(SCREEN.MENU);
      return;
    }
    await doJoinRoom(roomId, room);
  } catch (err) {
    console.error('Auto join failed:', err);
    showScreen(SCREEN.MENU);
  }
}

window._joinRoom = async (roomId) => {
  const room = _allRooms[roomId] || await getRoom(roomId);
  if (!room) return;
  if (room.private) {
    _pendingJoinRoomId   = roomId;
    _pendingJoinRoomData = room;
    document.getElementById('join-password-input').value = '';
    document.getElementById('join-password-error').textContent = '';
    document.getElementById('password-modal').classList.add('open');
    return;
  }
  await doJoinRoom(roomId, room);
};

async function handlePasswordConfirm() {
  const input = document.getElementById('join-password-input').value;
  const errEl = document.getElementById('join-password-error');
  if (!_pendingJoinRoomData) return;
  if (input !== _pendingJoinRoomData.password) {
    errEl.textContent = 'Wrong password.';
    return;
  }
  document.getElementById('password-modal').classList.remove('open');
  await doJoinRoom(_pendingJoinRoomId, _pendingJoinRoomData);
}

async function doJoinRoom(roomId, room) {
  const playerCount = Object.keys(room.players || {}).length;
  if (playerCount >= room.maxPlayers) {
    alert('This room is full!'); return;
  }

  const colorIndex = assignColorIndex(room.players || {});
  const playerData = buildPlayerData(colorIndex, false);

  try {
    await joinRoom(roomId, appState.playerId, playerData);
    setupPresence(roomId, appState.playerId, room.hostId, false);
    if (_unsubRooms) { _unsubRooms(); _unsubRooms = null; }

    appState.roomId  = roomId;
    appState.isHost  = false;
    appState.roomData= room;
    sfxJoin();
    showScreen(SCREEN.LOBBY);
  } catch (err) {
    console.error('Join room error:', err);
    alert('Failed to join room. Try again.');
  }
}

// ── Create Room ───────────────────────────────────────────────
async function handleCreateRoom() {
  const nameInput = document.getElementById('room-name-input').value.trim();
  const maxP      = parseInt(document.getElementById('room-max-players').value);
  const map       = document.getElementById('room-map').value;
  const isPrivate = document.getElementById('room-private').checked;
  const password  = document.getElementById('room-password').value.trim();
  const roomName  = nameInput || generateRoomName();

  const colorIndex = 0; // host is always first
  const mapSeed    = Math.floor(Math.random() * 999999);
  const roomId     = generateRoomId();

  const roomData = {
    roomId,
    roomName,
    hostId    : appState.playerId,
    map,
    mapSeed,
    maxPlayers: maxP,
    private   : isPrivate,
    password  : isPrivate ? password : '',
    players   : {
      [appState.playerId]: buildPlayerData(colorIndex, false),
    },
  };

  try {
    const id = await createRoom(roomData);
    setupPresence(id, appState.playerId, appState.playerId, true);

    if (_unsubRooms) { _unsubRooms(); _unsubRooms = null; }
    appState.roomId  = id;
    appState.isHost  = true;
    appState.roomData= roomData;
    sfxJoin();
    showScreen(SCREEN.LOBBY);
  } catch (err) {
    console.error('Create room error:', err);
    alert('Failed to create room. Check your Firebase config.');
  }
}

// ── Helpers ───────────────────────────────────────────────────
function buildPlayerData(colorIndex, ready) {
  return {
    nickname      : appState.nickname,
    colorIndex,
    color         : PLAYER_COLORS[colorIndex],
    colorDark     : PLAYER_DARK[colorIndex],
    avatar        : PLAYER_AVATARS[colorIndex],
    alive         : true,
    px            : 0,
    py            : 0,
    direction     : 'none',
    speed         : 180,
    bombCapacity  : 3,
    explosionRange: 1,
    shield        : false,
    canKick       : false,
    remoteDetonator: false,
    canGhost      : false,
    extraLives    : 0,
    ready,
    joinedAt      : Date.now(),
  };
}

function assignColorIndex(existingPlayers) {
  const used = new Set(Object.values(existingPlayers).map(p => p.colorIndex));
  for (let i = 0; i < 4; i++) {
    if (!used.has(i)) return i;
  }
  return 0;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
