// ============================================================
//  PAPAP DOL — ID and Name Generators
// ============================================================
import { ROOM_ADJECTIVES, ROOM_NOUNS } from './constants.js';

/** Random room display name */
export function generateRoomName() {
  const adj  = ROOM_ADJECTIVES[Math.floor(Math.random() * ROOM_ADJECTIVES.length)];
  const noun = ROOM_NOUNS[Math.floor(Math.random() * ROOM_NOUNS.length)];
  return `${adj} ${noun}`;
}

/** Short alphanumeric room key (used in Firebase path) */
export function generateRoomId() {
  return Date.now().toString(36).toUpperCase() +
         Math.random().toString(36).substr(2, 4).toUpperCase();
}

/** Unique player session ID stored in localStorage */
export function generatePlayerId() {
  return 'p_' + Math.random().toString(36).substr(2, 12);
}

/** Seeded pseudo-random number generator (Lehmer LCG) */
export function seededRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 0xFFFFFFFF;
  };
}
