// ============================================================
//  PAPAP DOL — Firebase Realtime Database Wrapper
// ============================================================
import { initializeApp }    from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getDatabase, ref, set, get, update, push,
  onValue, remove, off, onDisconnect, serverTimestamp,
  query, orderByChild, equalTo,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';
import { firebaseConfig } from '../firebase-config.js';

let _app = null;
let _db  = null;

// ── Init ─────────────────────────────────────────────────────
export function initFirebase() {
  if (_app) return _db;
  _app = initializeApp(firebaseConfig);
  _db  = getDatabase(_app);
  return _db;
}

export function getDb() { return _db; }

// ── Rooms ─────────────────────────────────────────────────────
export async function createRoom(roomData) {
  const r = push(ref(_db, 'rooms'));
  await set(r, { ...roomData, createdAt: Date.now(), status: 'waiting' });
  return r.key;
}

export function watchRooms(cb) {
  const q = query(ref(_db, 'rooms'), orderByChild('status'), equalTo('waiting'));
  onValue(q, snap => cb(snap.val() || {}));
  return () => off(q);
}

export function watchRoom(roomId, cb) {
  const r = ref(_db, `rooms/${roomId}`);
  onValue(r, snap => cb(snap.val()));
  return () => off(r);
}

export async function getRoom(roomId) {
  const snap = await get(ref(_db, `rooms/${roomId}`));
  return snap.val();
}

export async function updateRoom(roomId, data) {
  await update(ref(_db, `rooms/${roomId}`), data);
}

export async function deleteRoom(roomId) {
  await remove(ref(_db, `rooms/${roomId}`));
}

// ── Players ───────────────────────────────────────────────────
export async function joinRoom(roomId, playerId, playerData) {
  await set(ref(_db, `rooms/${roomId}/players/${playerId}`), playerData);
}

export async function updatePlayer(roomId, playerId, data) {
  await update(ref(_db, `rooms/${roomId}/players/${playerId}`), data);
}

export async function removePlayer(roomId, playerId) {
  await remove(ref(_db, `rooms/${roomId}/players/${playerId}`));
}

// Auto-remove player from room when they lose connection
export function setupPresence(roomId, playerId, hostId, isHost) {
  const playerRef  = ref(_db, `rooms/${roomId}/players/${playerId}`);
  const disc       = onDisconnect(playerRef);
  disc.remove();

  if (isHost) {
    // If host disconnects, the room won't auto-delete (handled by clean-up logic elsewhere)
    // But mark room hostId change to trigger reassignment on other clients
    const hostRef = ref(_db, `rooms/${roomId}/disconnectedHost`);
    onDisconnect(hostRef).set(playerId);
  }
}

// ── Bombs ─────────────────────────────────────────────────────
export async function placeBomb(roomId, bombData) {
  const r = push(ref(_db, `rooms/${roomId}/bombs`));
  await set(r, bombData);
  return r.key;
}

export async function removeBomb(roomId, bombId) {
  await remove(ref(_db, `rooms/${roomId}/bombs/${bombId}`));
}

// ── Power-Ups ─────────────────────────────────────────────────
export async function spawnPowerUp(roomId, puData) {
  const r = push(ref(_db, `rooms/${roomId}/powerUps`));
  await set(r, puData);
  return r.key;
}

export async function collectPowerUp(roomId, puId) {
  await remove(ref(_db, `rooms/${roomId}/powerUps/${puId}`));
}

// ── Destroyed Crates ──────────────────────────────────────────
export async function destroyCrate(roomId, x, y) {
  await set(ref(_db, `rooms/${roomId}/destroyedCrates/${x}_${y}`), true);
}

// ── Game State ────────────────────────────────────────────────
export async function setWinner(roomId, nickname) {
  await update(ref(_db, `rooms/${roomId}`), {
    winner : nickname,
    status : 'finished',
  });
}

export async function setGameStatus(roomId, status) {
  await update(ref(_db, `rooms/${roomId}`), { status });
}
