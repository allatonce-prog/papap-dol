// ============================================================
//  PAPAP DOL — Bot AI
//  Basic AI behavior tree for computer-controlled opponents.
//  Executes on the host client and syncs positions to Firebase.
// ============================================================

import { TILE_SIZE, BOMB_FUSE_MS } from '../utils/constants.js';
import { updatePlayer, placeBomb as fbPlaceBomb } from '../firebase.js';

export class BotAI {
  constructor(botId, colorIndex, initialData, gameManager) {
    this.botId = botId;
    this.colorIndex = colorIndex;
    this.game = gameManager;
    this.map = gameManager.map;
    
    this.px = initialData.px;
    this.py = initialData.py;
    
    this.targetTx = Math.floor(this.px / TILE_SIZE);
    this.targetTy = Math.floor(this.py / TILE_SIZE);
    
    this.speed = initialData.speed || 130;
    this.direction = 'down';
    this.alive = true;
    this.activeBombs = 0;
    this.bombCooldown = 0;
  }

  update(dt) {
    if (!this.alive) return;

    if (this.bombCooldown > 0) this.bombCooldown -= dt;

    // Check if we are close to our target tile
    const targetPx = this.targetTx * TILE_SIZE + TILE_SIZE / 2;
    const targetPy = this.targetTy * TILE_SIZE + TILE_SIZE / 2;
    
    const dx = targetPx - this.px;
    const dy = targetPy - this.py;
    const dist = Math.sqrt(dx*dx + dy*dy);

    if (dist < 4) {
      this.px = targetPx;
      this.py = targetPy;
      this._decideNextMove();
    } else {
      const step = this.speed * dt;
      if (Math.abs(dx) > 2) {
        this.px += Math.sign(dx) * Math.min(step, Math.abs(dx));
        this.direction = dx > 0 ? 'right' : 'left';
      } else if (Math.abs(dy) > 2) {
        this.py += Math.sign(dy) * Math.min(step, Math.abs(dy));
        this.direction = dy > 0 ? 'down' : 'up';
      }
    }
  }

  _decideNextMove() {
    const cx = Math.floor(this.px / TILE_SIZE);
    const cy = Math.floor(this.py / TILE_SIZE);

    const dangerTiles = this._getDangerTiles();
    const isCurrentTileDangerous = dangerTiles.has(`${cx},${cy}`);

    const moves = [
      { x: cx, y: cy - 1, dir: 'up' },
      { x: cx, y: cy + 1, dir: 'down' },
      { x: cx - 1, y: cy, dir: 'left' },
      { x: cx + 1, y: cy, dir: 'right' }
    ].filter(m => this._isValidMove(m.x, m.y));

    if (isCurrentTileDangerous) {
      const safeMoves = moves.filter(m => !dangerTiles.has(`${m.x},${m.y}`));
      if (safeMoves.length > 0) {
        const choice = safeMoves[Math.floor(Math.random() * safeMoves.length)];
        this.targetTx = choice.x;
        this.targetTy = choice.y;
        return;
      }
      if (moves.length > 0) {
        const choice = moves[Math.floor(Math.random() * moves.length)];
        this.targetTx = choice.x;
        this.targetTy = choice.y;
        return;
      }
    }

    const hasAdjacentCrate = this._hasAdjacentCrate(cx, cy);
    if (hasAdjacentCrate && this.activeBombs < 1 && this.bombCooldown <= 0) {
      this._plantBomb(cx, cy);
      this.bombCooldown = 4.0;
      
      const dangerWithNewBomb = this._getDangerTiles();
      const safeMoves = moves.filter(m => !dangerWithNewBomb.has(`${m.x},${m.y}`));
      if (safeMoves.length > 0) {
        const choice = safeMoves[Math.floor(Math.random() * safeMoves.length)];
        this.targetTx = choice.x;
        this.targetTy = choice.y;
        return;
      }
    }

    if (moves.length > 0) {
      const oppositeDir = { 'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left' }[this.direction];
      const forwardMoves = moves.filter(m => m.dir !== oppositeDir);
      
      const pool = forwardMoves.length > 0 ? forwardMoves : moves;
      const choice = pool[Math.floor(Math.random() * pool.length)];
      this.targetTx = choice.x;
      this.targetTy = choice.y;
    }
  }

  _isValidMove(tx, ty) {
    if (this.map.isWall(tx, ty) || this.map.isCrate(tx, ty)) return false;
    if (this.game.hasBombAt(tx, ty)) return false;
    return true;
  }

  _hasAdjacentCrate(tx, ty) {
    return [
      this.map.isCrate(tx, ty - 1),
      this.map.isCrate(tx, ty + 1),
      this.map.isCrate(tx - 1, ty),
      this.map.isCrate(tx + 1, ty)
    ].some(Boolean);
  }

  _getDangerTiles() {
    const danger = new Set();
    for (const bomb of this.game.bombs.values()) {
      const cells = this.map.calcExplosionCells(bomb.x, bomb.y, bomb.range);
      cells.forEach(c => danger.add(`${c.x},${c.y}`));
    }
    return danger;
  }

  _plantBomb(tx, ty) {
    this.activeBombs++;
    const bombData = {
      owner: this.botId,
      x: tx,
      y: ty,
      placedAt: Date.now(),
      explodeAt: Date.now() + BOMB_FUSE_MS,
      explosionRange: 1,
      remote: false
    };

    fbPlaceBomb(this.game.roomId, bombData).then(id => {
      setTimeout(() => {
        this.activeBombs = Math.max(0, this.activeBombs - 1);
      }, BOMB_FUSE_MS + 200);
    }).catch(() => {
      this.activeBombs = Math.max(0, this.activeBombs - 1);
    });
  }

  toFirebase() {
    return {
      px: Math.round(this.px),
      py: Math.round(this.py),
      direction: this.direction,
      alive: this.alive,
      speed: this.speed,
      bombCapacity: 1,
      explosionRange: 1,
      shield: false,
      canKick: false,
      remoteDetonator: false,
      canGhost: false,
      extraLives: 0
    };
  }
}
