// ============================================================
//  PAPAP DOL — Bot AI
//  Advanced AI state machine for competitive bot opponents.
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
    
    // Increased default speed from 130 to 165 to make them competitive
    this.speed = initialData.speed || 165;
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

    // 1. ESCAPE DANGER FIRST
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
      return; // stand still if trapped
    }

    const targetPlayer = this._getClosestPlayer(cx, cy);

    // 2. AGGRESSIVE BOMB ATTACK (if player is lined up within range)
    if (targetPlayer && this.bombCooldown <= 0 && this.activeBombs < 1) {
      const dist = Math.abs(cx - targetPlayer.x) + Math.abs(cy - targetPlayer.y);
      const isLinedUp = (cx === targetPlayer.x || cy === targetPlayer.y) && dist <= 3;
      if (isLinedUp) {
        this._plantBomb(cx, cy);
        this.bombCooldown = 2.0; // reduced cooldown from 4.0 to 2.0

        // Evacuate immediately
        const dangerWithNewBomb = this._getDangerTiles();
        const safeMoves = moves.filter(m => !dangerWithNewBomb.has(`${m.x},${m.y}`));
        if (safeMoves.length > 0) {
          const choice = safeMoves[Math.floor(Math.random() * safeMoves.length)];
          this.targetTx = choice.x;
          this.targetTy = choice.y;
          return;
        }
      }
    }

    // 3. TARGET POWER-UPS
    const targetPU = this._getClosestPowerUp(cx, cy);
    if (targetPU) {
      const safeMoves = moves.filter(m => !dangerTiles.has(`${m.x},${m.y}`));
      if (safeMoves.length > 0) {
        safeMoves.sort((a, b) => {
          const distA = Math.abs(a.x - targetPU.x) + Math.abs(a.y - targetPU.y);
          const distB = Math.abs(b.x - targetPU.x) + Math.abs(b.y - targetPU.y);
          return distA - distB;
        });
        this.targetTx = safeMoves[0].x;
        this.targetTy = safeMoves[0].y;
        return;
      }
    }

    // 4. CLEAR CRATES
    const hasAdjacentCrate = this._hasAdjacentCrate(cx, cy);
    if (hasAdjacentCrate && this.activeBombs < 1 && this.bombCooldown <= 0) {
      this._plantBomb(cx, cy);
      this.bombCooldown = 2.0; // reduced cooldown to 2.0
      
      const dangerWithNewBomb = this._getDangerTiles();
      const safeMoves = moves.filter(m => !dangerWithNewBomb.has(`${m.x},${m.y}`));
      if (safeMoves.length > 0) {
        const choice = safeMoves[Math.floor(Math.random() * safeMoves.length)];
        this.targetTx = choice.x;
        this.targetTy = choice.y;
        return;
      }
    }

    // 5. CHASE/PATH TO CLOSEST PLAYER
    if (targetPlayer) {
      const safeMoves = moves.filter(m => !dangerTiles.has(`${m.x},${m.y}`));
      if (safeMoves.length > 0) {
        safeMoves.sort((a, b) => {
          const distA = Math.abs(a.x - targetPlayer.x) + Math.abs(a.y - targetPlayer.y);
          const distB = Math.abs(b.x - targetPlayer.x) + Math.abs(b.y - targetPlayer.y);
          return distA - distB;
        });
        this.targetTx = safeMoves[0].x;
        this.targetTy = safeMoves[0].y;
        return;
      }
    }

    // 6. DEFAULT WANDER
    if (moves.length > 0) {
      const safeMoves = moves.filter(m => !dangerTiles.has(`${m.x},${m.y}`));
      const pool = safeMoves.length > 0 ? safeMoves : moves;
      
      const oppositeDir = { 'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left' }[this.direction];
      const forwardMoves = pool.filter(m => m.dir !== oppositeDir);
      
      const choice = forwardMoves.length > 0 ? forwardMoves : pool;
      const finalMove = choice[Math.floor(Math.random() * choice.length)];
      this.targetTx = finalMove.x;
      this.targetTy = finalMove.y;
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

  _getClosestPlayer(cx, cy) {
    let closest = null;
    let minDist = Infinity;

    if (this.game.localPlayer && this.game.localPlayer.alive) {
      const px = Math.floor(this.game.localPlayer.px / TILE_SIZE);
      const py = Math.floor(this.game.localPlayer.py / TILE_SIZE);
      const dist = Math.abs(px - cx) + Math.abs(py - cy);
      if (dist < minDist) {
        minDist = dist;
        closest = { x: px, y: py };
      }
    }

    this.game.remotePlayers.forEach((p, pid) => {
      if (p.alive && !pid.startsWith('bot_')) {
        const px = Math.floor(p.px / TILE_SIZE);
        const py = Math.floor(p.py / TILE_SIZE);
        const dist = Math.abs(px - cx) + Math.abs(py - cy);
        if (dist < minDist) {
          minDist = dist;
          closest = { x: px, y: py };
        }
      }
    });

    return closest;
  }

  _getClosestPowerUp(cx, cy) {
    let closest = null;
    let minDist = Infinity;
    this.game.powerUps.forEach(pu => {
      const pux = Math.floor(pu.px / TILE_SIZE);
      const puy = Math.floor(pu.py / TILE_SIZE);
      const dist = Math.abs(pux - cx) + Math.abs(puy - cy);
      if (dist < minDist && dist <= 5) {
        minDist = dist;
        closest = { x: pux, y: puy };
      }
    });
    return closest;
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
