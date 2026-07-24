// ============================================================
//  PAPAP DOL — Power-Up Entity
// ============================================================
import { TILE_SIZE, POWERUP_EMOJI, POWERUP_COLOR, POWERUP_LIFETIME_MS } from '../utils/constants.js';

export class PowerUp {
  constructor(id, data) {
    this.id       = id;
    this.type     = data.type;
    this.x        = data.x;   // tile x
    this.y        = data.y;   // tile y
    this.spawnedAt= data.spawnedAt || Date.now();
    this.collected= false;
    this._bob     = Math.random() * Math.PI * 2; // phase offset
  }

  get px() { return this.x * TILE_SIZE + TILE_SIZE / 2; }
  get py() { return this.y * TILE_SIZE + TILE_SIZE / 2; }
  get emoji()  { return POWERUP_EMOJI[this.type]  || '?'; }
  get color()  { return POWERUP_COLOR[this.type]  || '#ffffff'; }
  get isExpired() { return Date.now() - this.spawnedAt > POWERUP_LIFETIME_MS; }

  /** Y offset for floating bob animation */
  bobOffset(now) {
    return Math.sin(now / 500 + this._bob) * 4;
  }

  /** Returns true if a player (px,py) is overlapping this power-up */
  overlapsPlayer(playerPx, playerPy) {
    const dx = playerPx - this.px;
    const dy = playerPy - this.py;
    return Math.hypot(dx, dy) < TILE_SIZE * 0.6;
  }
}
