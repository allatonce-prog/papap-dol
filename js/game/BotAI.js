// ============================================================
//  PAPAP DOL — Smart Extreme Bot AI
//  Tactical AI with flood-fill pathfinding & zero self-destruction.
// ============================================================

import { TILE_SIZE, BOMB_FUSE_MS } from '../utils/constants.js';
import { placeBomb as fbPlaceBomb } from '../firebase.js';

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
    
    // Dynamic Tactical Personalities
    const personalities = ['aggressive', 'scavenger', 'bomber'];
    this.personality = personalities[colorIndex % personalities.length];

    // High speed tuned for fast gameplay
    this.speed = (initialData.speed || 215) + (this.personality === 'bomber' ? 25 : 10);
    this.bombCapacity = 3;
    this.explosionRange = 2;
    this.direction = 'down';
    this.alive = true;
    this.activeBombs = 0;
    this.bombCooldown = 0;
  }

  update(dt) {
    if (!this.alive) return;

    if (this.bombCooldown > 0) this.bombCooldown -= dt;

    const targetPx = this.targetTx * TILE_SIZE + TILE_SIZE / 2;
    const targetPy = this.targetTy * TILE_SIZE + TILE_SIZE / 2;
    
    const dx = targetPx - this.px;
    const dy = targetPy - this.py;
    const dist = Math.hypot(dx, dy);

    if (dist <= 2) {
      this.px = targetPx;
      this.py = targetPy;
      this.vx = 0;
      this.vy = 0;
      this._decideNextMove();
    } else {
      const step = Math.min(this.speed * dt, dist);
      const nx = dx / dist;
      const ny = dy / dist;

      this.vx = nx * this.speed;
      this.vy = ny * this.speed;

      this.px += nx * step;
      this.py += ny * step;

      if (Math.abs(dx) > Math.abs(dy)) {
        this.direction = dx > 0 ? 'right' : 'left';
      } else {
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

    // 1. ESCAPE DANGER IMMEDIATELY (BFS path to nearest safe tile)
    if (isCurrentTileDangerous) {
      const safePath = this._findPathToSafety(cx, cy);
      if (safePath && safePath.length > 0) {
        this.targetTx = safePath[0].x;
        this.targetTy = safePath[0].y;
        return;
      }
      // If no full path, pick move furthest from bomb explosion center
      const safeMoves = moves.filter(m => !dangerTiles.has(`${m.x},${m.y}`));
      if (safeMoves.length > 0) {
        safeMoves.sort((a, b) => this._minDistToBomb(b.x, b.y) - this._minDistToBomb(a.x, a.y));
        this.targetTx = safeMoves[0].x;
        this.targetTy = safeMoves[0].y;
        return;
      }
      return; // Trapped
    }

    const targetPlayer = this._getClosestPlayer(cx, cy);

    // 2. ATTACK ENEMY PLAYER (Only plant if a guaranteed escape path exists!)
    if (targetPlayer && this.bombCooldown <= 0 && this.activeBombs < this.bombCapacity) {
      const dist = Math.abs(cx - targetPlayer.x) + Math.abs(cy - targetPlayer.y);
      const isLinedUp = (cx === targetPlayer.x || cy === targetPlayer.y) && dist <= (this.explosionRange + 1);
      
      if (isLinedUp && this._hasGuaranteedEscape(cx, cy)) {
        this._plantBomb(cx, cy);
        this.bombCooldown = 0.4;

        const safePath = this._findPathToSafety(cx, cy);
        if (safePath && safePath.length > 0) {
          this.targetTx = safePath[0].x;
          this.targetTy = safePath[0].y;
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

    // 4. DESTROY CRATES (Only if safe escape path exists!)
    const hasAdjacentCrate = this._hasAdjacentCrate(cx, cy);
    if (hasAdjacentCrate && this.activeBombs < this.bombCapacity && this.bombCooldown <= 0) {
      if (this._hasGuaranteedEscape(cx, cy)) {
        this._plantBomb(cx, cy);
        this.bombCooldown = 1.0;
        
        const safePath = this._findPathToSafety(cx, cy);
        if (safePath && safePath.length > 0) {
          this.targetTx = safePath[0].x;
          this.targetTy = safePath[0].y;
          return;
        }
      }
    }

    // 5. HUNT ENEMY PLAYER
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

    // 6. SAFE PATROL
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

  // Check if planting a bomb at (cx, cy) leaves a valid BFS path to a completely safe tile
  _hasGuaranteedEscape(cx, cy) {
    const danger = this._getDangerTiles();
    const blast = this.map.calcExplosionCells(cx, cy, this.explosionRange);
    blast.forEach(c => danger.add(`${c.x},${c.y}`));

    const queue = [{ x: cx, y: cy, dist: 0 }];
    const visited = new Set([`${cx},${cy}`]);

    while (queue.length > 0) {
      const curr = queue.shift();
      if (!danger.has(`${curr.x},${curr.y}`) && (curr.x !== cx || curr.y !== cy)) {
        return true; // Found a safe tile!
      }
      if (curr.dist > 5) continue; // max search depth

      const neighbors = [
        { x: curr.x, y: curr.y - 1 }, { x: curr.x, y: curr.y + 1 },
        { x: curr.x - 1, y: curr.y }, { x: curr.x + 1, y: curr.y }
      ];

      for (const n of neighbors) {
        const key = `${n.x},${n.y}`;
        if (!visited.has(key) && (n.x === cx && n.y === cy || this._isValidMove(n.x, n.y))) {
          visited.add(key);
          queue.push({ x: n.x, y: n.y, dist: curr.dist + 1 });
        }
      }
    }
    return false;
  }

  // BFS pathfinding to nearest safe tile outside danger zones
  _findPathToSafety(cx, cy) {
    const danger = this._getDangerTiles();
    if (!danger.has(`${cx},${cy}`)) return [];

    const queue = [{ x: cx, y: cy, path: [] }];
    const visited = new Set([`${cx},${cy}`]);

    while (queue.length > 0) {
      const curr = queue.shift();
      if (!danger.has(`${curr.x},${curr.y}`)) {
        return curr.path;
      }
      if (curr.path.length > 8) continue;

      const neighbors = [
        { x: curr.x, y: curr.y - 1 }, { x: curr.x, y: curr.y + 1 },
        { x: curr.x - 1, y: curr.y }, { x: curr.x + 1, y: curr.y }
      ];

      for (const n of neighbors) {
        const key = `${n.x},${n.y}`;
        if (!visited.has(key) && this._isValidMove(n.x, n.y)) {
          visited.add(key);
          queue.push({ x: n.x, y: n.y, path: [...curr.path, { x: n.x, y: n.y }] });
        }
      }
    }
    return null;
  }

  _minDistToBomb(tx, ty) {
    let minDist = 999;
    for (const bomb of this.game.bombs.values()) {
      const d = Math.abs(tx - bomb.x) + Math.abs(ty - bomb.y);
      if (d < minDist) minDist = d;
    }
    return minDist;
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
      if (dist < minDist) {
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
      explosionRange: this.explosionRange,
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
      px: Math.round(this.px * 10) / 10,
      py: Math.round(this.py * 10) / 10,
      vx: Math.round((this.vx || 0) * 10) / 10,
      vy: Math.round((this.vy || 0) * 10) / 10,
      direction: this.direction,
      alive: this.alive,
      speed: this.speed,
      bombCapacity: this.bombCapacity,
      explosionRange: this.explosionRange,
      shield: false,
      canKick: false,
      remoteDetonator: false,
      canGhost: false,
      extraLives: 0,
      ts: Date.now()
    };
  }
}
