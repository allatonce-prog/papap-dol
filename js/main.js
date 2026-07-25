// ============================================================
//  PAPAP DOL — App Bootstrap & Screen Router
// ============================================================
import { initFirebase }        from './firebase.js';
import { initNickname }        from './nickname.js';
import { initMenu }            from './menu.js';
import { initRooms }           from './rooms.js';
import { initLobby }           from './lobby.js';
import { SCREEN }              from './utils/constants.js';
import { unlockAudio }         from './game/Audio.js';

// ── State ─────────────────────────────────────────────────────
export const appState = {
  nickname  : null,
  playerId  : null,
  roomId    : null,
  isHost    : false,
  roomData  : null,
};

// ── Screen Management ─────────────────────────────────────────
const screens = Object.fromEntries(
  Object.values(SCREEN).map(id => [id, document.getElementById(id)])
);

export function showScreen(id) {
  Object.entries(screens).forEach(([key, el]) => {
    if (!el) return;
    if (key === id) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
}

// ── Init ──────────────────────────────────────────────────────
async function main() {
  // Unlock audio on any user interaction
  document.addEventListener('click', unlockAudio, { once: true });
  document.addEventListener('keydown', unlockAudio, { once: true });

  // Init Firebase (will throw if config is placeholder)
  try {
    initFirebase();
  } catch (err) {
    console.error('[Papap Dol] Firebase init failed. Did you fill in firebase-config.js?', err);
    alert('⚠️ Firebase not configured!\n\nPlease fill in your Firebase credentials in firebase-config.js.\n\nSee the comments in that file for instructions.');
    return;
  }

  // Init UI modules
  initNickname();
  initMenu();
  initRooms();
  initLobby();

  // Check for auto-join URL param ?room=ABC123
  const urlParams = new URLSearchParams(window.location.search);
  const autoRoomId = urlParams.get('room');

  // Check for saved nickname & player ID
  const savedNick = localStorage.getItem('papap_nickname');
  const savedPid  = localStorage.getItem('papap_player_id');

  if (savedNick && savedNick.length >= 3) {
    appState.nickname = savedNick;
    appState.playerId = savedPid || generateAndSavePid();
    if (autoRoomId) {
      import('./rooms.js').then(m => m.joinRoomById(autoRoomId.trim().toUpperCase()));
    } else {
      showScreen(SCREEN.MENU);
    }
  } else {
    showScreen(SCREEN.NICKNAME);
  }
}

function generateAndSavePid() {
  const pid = 'p_' + Math.random().toString(36).substr(2, 12);
  localStorage.setItem('papap_player_id', pid);
  return pid;
}

main();
