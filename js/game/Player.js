// ============================================================
//  PAPAP DOL — Local Player (keyboard-controlled)
// ============================================================
import {
  TILE_SIZE, DEFAULT_SPEED, SPEED_BOOST_AMOUNT,
  SPAWN_POSITIONS, BOMB_FUSE_MS, POWERUP,
} from '../utils/constants.js';
import { sfxBombPlace } from './Audio.js';

export const KEYS = {};

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
document.addEventListener('keydown', e => {
  if (INPUT_TAGS.has(e.target.tagName)) return; // let text fields type normally
  KEYS[e.code] = true;
  // Only block scroll keys during gameplay
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
}, { capture: true });
document.addEventListener('keyup', e => {
  if (INPUT_TAGS.has(e.target.tagName)) return;
  KEYS[e.code] = false;
}, { capture: true });

export class Player {
  constructor(playerId, colorIndex, gameManager) {
    this.playerId     = playerId;
    this.colorIndex   = colorIndex;
    this.game         = gameManager;
    this.map          = gameManager.map;

    const spawn       = SPAWN_POSITIONS[colorIndex] || SPAWN_POSITIONS[0];
    this.tileX        = spawn.x;
    this.tileY        = spawn.y;
    this.px           = spawn.x * TILE_SIZE + TILE_SIZE / 2;
    this.py           = spawn.y * TILE_SIZE + TILE_SIZE / 2;

    // Stats
    this.speed        = DEFAULT_SPEED;
    this.bombCapacity = 3;
    this.explosionRange = 1;
    this.shield       = false;
    this.canKick      = false;
    this.remoteDetonator = false;
    this.canGhost     = false;
    this.extraLives   = 0;
    this.alive        = true;

    // Bomb tracking
    this.bombsActive  = 0;
    this._remoteBombs = [];

    // Visual
    this.direction    = 'down';
    this._walkFrame   = 0;
    this._lastDx      = 0;
    this._lastDy      = 0;

    // Grace tile set (tiles where player walked through their own bomb initially)
    this._graceTiles  = new Set();
  }

  // ── Update (called every frame) ────────────────────────────
  update(dt) {
    if (!this.alive) return;

    let dx = 0, dy = 0;
    if (KEYS['KeyW'] || KEYS['ArrowUp'])    dy = -1;
    if (KEYS['KeyS'] || KEYS['ArrowDown'])  dy =  1;
    if (KEYS['KeyA'] || KEYS['ArrowLeft'])  dx = -1;
    if (KEYS['KeyD'] || KEYS['ArrowRight']) dx =  1;

    // Only 4-directional movement (prioritize last key)
    if (dx !== 0 && dy !== 0) {
      if (this._lastDy !== 0) dx = 0;
      else dy = 0;
    }
    this._lastDx = dx;
    this._lastDy = dy;

    if (dx !== 0 || dy !== 0) {
      if (dx === -1) this.direction = 'left';
      else if (dx === 1) this.direction = 'right';
      else if (dy === -1) this.direction = 'up';
      else if (dy === 1) this.direction = 'down';

      const spd = this.speed;
      const newPx = this.px + dx * spd * dt;
      const newPy = this.py + dy * spd * dt;

      // X movement
      if (!this._checkCollision(newPx, this.py)) this.px = newPx;
      // Y movement
      if (!this._checkCollision(this.px, newPy)) this.py = newPy;

      this._walkFrame += dt * 8;
    }

    // Clamp to canvas
    const hw = TILE_SIZE * 0.72 / 2;
    this.px = Math.max(hw, Math.min(this.game.mapPixelW - hw, this.px));
    this.py = Math.max(hw, Math.min(this.game.mapPixelH - hw, this.py));

    this.tileX = Math.round(this.px / TILE_SIZE);
    this.tileY = Math.round(this.py / TILE_SIZE);

    // Bomb placement
    if (KEYS['Space']) this._tryPlaceBomb();

    // Remote detonation
    if (KEYS['ShiftLeft'] || KEYS['ShiftRight']) {
      this._tryRemoteDetonate();
      KEYS['ShiftLeft'] = false; KEYS['ShiftRight'] = false;
    }
  }

  _checkCollision(px, py) {
    const half = (TILE_SIZE * 0.72) / 2 - 2;
    const corners = [
      { x: px - half, y: py - half },
      { x: px + half, y: py - half },
      { x: px - half, y: py + half },
      { x: px + half, y: py + half },
    ];
    for (const c of corners) {
      const tx = Math.floor(c.x / TILE_SIZE);
      const ty = Math.floor(c.y / TILE_SIZE);
      if (this.map.isWall(tx, ty)) return true;
      if (this.map.isCrate(tx, ty) && !this.canGhost) return true;
      // Bomb collision: treat bomb tiles as solid except grace tiles
      const key = `${tx},${ty}`;
      if (this.game.hasBombAt(tx, ty) && !this._graceTiles.has(key)) return true;
    }
    return false;
  }

  // Returns the tile {tx, ty} where the bomb should be placed.
  // Uses Math.floor (the tile the player center is INSIDE), then biases
  // toward the joystick/movement direction when near a tile boundary.
  _getBombTile() {
    // Tile the player's center pixel is inside
    const baseTx = Math.floor(this.px / TILE_SIZE);
    const baseTy = Math.floor(this.py / TILE_SIZE);

    // Fraction across the tile (0 = left/top edge, 1 = right/bottom edge)
    const fracX = (this.px - baseTx * TILE_SIZE) / TILE_SIZE;
    const fracY = (this.py - baseTy * TILE_SIZE) / TILE_SIZE;

    // Within this fraction from any edge → "between tiles", use direction
    const EDGE = 0.30;

    let tx = baseTx;
    let ty = baseTy;

    // Horizontal bias
    if (fracX < EDGE && (KEYS['ArrowLeft'] || KEYS['KeyA'] || this._lastDx < 0)) {
      tx = baseTx - 1;
    } else if (fracX > (1 - EDGE) && (KEYS['ArrowRight'] || KEYS['KeyD'] || this._lastDx > 0)) {
      tx = baseTx + 1;
    }

    // Vertical bias
    if (fracY < EDGE && (KEYS['ArrowUp'] || KEYS['KeyW'] || this._lastDy < 0)) {
      ty = baseTy - 1;
    } else if (fracY > (1 - EDGE) && (KEYS['ArrowDown'] || KEYS['KeyS'] || this._lastDy > 0)) {
      ty = baseTy + 1;
    }

    return { tx, ty };
  }

  _tryPlaceBomb() {
    if (!KEYS['Space']) return;
    KEYS['Space'] = false; // consume

    if (this.bombsActive >= this.bombCapacity) return;

    const { tx, ty } = this._getBombTile();
    if (this.game.hasBombAt(tx, ty)) return;
    if (this.map.isWall(tx, ty)) return;

    this.bombsActive++;
    const bombData = {
      owner         : this.playerId,
      x             : tx,
      y             : ty,
      placedAt      : Date.now(),
      explodeAt     : Date.now() + BOMB_FUSE_MS,
      explosionRange: this.explosionRange,
      remote        : this.remoteDetonator,
    };

    // Grace tile so player can walk out
    this._graceTiles.add(`${tx},${ty}`);
    setTimeout(() => this._graceTiles.delete(`${tx},${ty}`), 500);

    sfxBombPlace();
    this.game.onLocalBombPlaced(bombData);
  }


  _tryRemoteDetonate() {
    if (!this.remoteDetonator) return;
    this.game.detonateRemoteBombs(this.playerId);
  }

  onBombExploded(bombId) {
    this.bombsActive = Math.max(0, this.bombsActive - 1);
  }

  // ── Apply power-up ─────────────────────────────────────────
  applyPowerUp(type) {
    switch (type) {
      case POWERUP.BOMB  : this.bombCapacity   = Math.min(3, this.bombCapacity   + 1); break;
      case POWERUP.FIRE  : this.explosionRange = Math.min(8, this.explosionRange + 1); break;
      case POWERUP.SPEED : this.speed = Math.min(280, this.speed + SPEED_BOOST_AMOUNT);  break;
      case POWERUP.SHIELD: this.shield = true;  break;
      case POWERUP.KICK  : this.canKick = true; break;
      case POWERUP.REMOTE: this.remoteDetonator = true; break;
      case POWERUP.GHOST : this.canGhost = true; break;
      case POWERUP.LIFE  : this.extraLives = Math.min(3, this.extraLives + 1); break;
    }
  }

  // ── Death ──────────────────────────────────────────────────
  die() {
    if (!this.alive) return false;
    if (this.shield) { this.shield = false; return false; } // absorbed!
    if (this.extraLives > 0) { this.extraLives--; return false; } // revive
    this.alive = false;
    return true; // actually died
  }

  // ── Serialise for Firebase ─────────────────────────────────
  toFirebase() {
    return {
      px: Math.round(this.px),
      py: Math.round(this.py),
      direction     : this.direction,
      alive         : this.alive,
      speed         : this.speed,
      bombCapacity  : this.bombCapacity,
      explosionRange: this.explosionRange,
      shield        : this.shield,
      canKick       : this.canKick,
      remoteDetonator: this.remoteDetonator,
      canGhost      : this.canGhost,
      extraLives    : this.extraLives,
    };
  }
}
