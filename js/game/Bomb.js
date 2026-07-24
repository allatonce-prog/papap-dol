// ============================================================
//  PAPAP DOL — Bomb & Explosion Logic
// ============================================================
import { TILE_SIZE, EXPLOSION_FADE_MS } from '../utils/constants.js';

// ─────────────────────────────────────────────────────────────
//  Bomb
// ─────────────────────────────────────────────────────────────
export class Bomb {
  /**
   * @param {string} id       Firebase key
   * @param {object} data     { owner, x, y, placedAt, explodeAt, explosionRange, remote }
   * @param {GameMap} map
   */
  constructor(id, data, map) {
    this.id       = id;
    this.owner    = data.owner;
    this.x        = data.x;   // tile x
    this.y        = data.y;   // tile y
    this.placedAt = data.placedAt;
    this.explodeAt= data.explodeAt;
    this.range    = data.explosionRange || 1;
    this.remote   = data.remote || false;
    this.map      = map;
    this.exploded = false;
    this._pulse   = 0;

    // Track visual pixels for smooth sliding animation
    this.visualPx = data.x * TILE_SIZE + TILE_SIZE / 2;
    this.visualPy = data.y * TILE_SIZE + TILE_SIZE / 2;
  }

  get px() { return this.visualPx; }
  get py() { return this.visualPy; }

  /** 0→1, progress of fuse */
  get fuseProgress() {
    const total = this.explodeAt - this.placedAt;
    const elapsed = Date.now() - this.placedAt;
    return Math.min(1, elapsed / total);
  }

  get shouldExplode() {
    return !this.exploded && Date.now() >= this.explodeAt;
  }

  update(dt) {
    this._pulse = (this._pulse + dt * 4) % (Math.PI * 2);

    // Smoothly slide towards the target tile coordinates
    const targetPx = this.x * TILE_SIZE + TILE_SIZE / 2;
    const targetPy = this.y * TILE_SIZE + TILE_SIZE / 2;
    const slideSpeed = 360; // pixels per second (~7.5 tiles/sec)

    const dx = targetPx - this.visualPx;
    const dy = targetPy - this.visualPy;
    const dist = Math.sqrt(dx*dx + dy*dy);

    if (dist > 1) {
      this.visualPx += (dx / dist) * Math.min(slideSpeed * dt, dist);
      this.visualPy += (dy / dist) * Math.min(slideSpeed * dt, dist);
    } else {
      this.visualPx = targetPx;
      this.visualPy = targetPy;
    }
  }

  /** Radius for drawing (pulses based on fuse) */
  get drawRadius() {
    const base = TILE_SIZE * 0.38;
    const t    = this.fuseProgress;
    // Pulse faster near end
    const speed = 4 + t * 10;
    return base * (1 + 0.15 * Math.sin(Date.now() / 1000 * speed));
  }
}

// ─────────────────────────────────────────────────────────────
//  Explosion (local visual)
// ─────────────────────────────────────────────────────────────
export class Explosion {
  constructor(cells) {
    this.cells    = cells;  // [{ x, y, isCenter, isEnd, dir }]
    this.createdAt= Date.now();
    this.alive    = true;
  }

  get progress() {
    return Math.min(1, (Date.now() - this.createdAt) / EXPLOSION_FADE_MS);
  }

  get alpha() {
    const p = this.progress;
    return p < 0.5 ? 1 : 1 - (p - 0.5) * 2;
  }

  update() {
    if (this.progress >= 1) this.alive = false;
  }

  containsTile(tx, ty) {
    return this.cells.some(c => c.x === tx && c.y === ty);
  }
}

// ─────────────────────────────────────────────────────────────
//  Particle Sparks (local visual only)
// ─────────────────────────────────────────────────────────────
export class Spark {
  constructor(px, py) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 180;
    this.px  = px;
    this.py  = py;
    this.vx  = Math.cos(angle) * speed;
    this.vy  = Math.sin(angle) * speed - 60;
    this.life= 1;
    this.size= 2 + Math.random() * 4;
    this.color = ['#ff6600','#ff9900','#ffcc00','#ff3300'][Math.floor(Math.random()*4)];
  }

  update(dt) {
    this.px  += this.vx * dt;
    this.py  += this.vy * dt;
    this.vy  += 200 * dt;   // gravity
    this.life-= dt * 2.5;
  }

  get alive() { return this.life > 0; }
}
