// ============================================================
//  PAPAP DOL — Monster / Mob Entity
//  Types: Slime (fast), Ghost (crate pass), Exploder (kamikaze)
// ============================================================
import { TILE_SIZE } from '../utils/constants.js';

export const MOB_TYPES = {
  SLIME:    { id: 'slime',    emoji: '👾', color: '#33ff66', speed: 130, ghost: false },
  GHOST:    { id: 'ghost',    emoji: '👻', color: '#bb66ff', speed: 90,  ghost: true  },
  EXPLODER: { id: 'exploder', emoji: '🕷️', color: '#ff3344', speed: 100, ghost: false },
};

export class Monster {
  constructor(id, typeKey, tileX, tileY, gameManager) {
    this.id = id;
    this.game = gameManager;
    this.map = gameManager.map;
    
    const config = MOB_TYPES[typeKey] || MOB_TYPES.SLIME;
    this.type = config.id;
    this.emoji = config.emoji;
    this.color = config.color;
    this.speed = config.speed;
    this.canGhost = config.ghost;

    this.px = tileX * TILE_SIZE + TILE_SIZE / 2;
    this.py = tileY * TILE_SIZE + TILE_SIZE / 2;

    this.targetTx = tileX;
    this.targetTy = tileY;
    this.direction = 'down';
    this.alive = true;
  }

  update(dt) {
    if (!this.alive) return;

    const targetPx = this.targetTx * TILE_SIZE + TILE_SIZE / 2;
    const targetPy = this.targetTy * TILE_SIZE + TILE_SIZE / 2;

    const dx = targetPx - this.px;
    const dy = targetPy - this.py;
    const dist = Math.sqrt(dx * dx + dy * dy);

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

    const validMoves = [
      { x: cx,     y: cy - 1, dir: 'up'    },
      { x: cx,     y: cy + 1, dir: 'down'  },
      { x: cx - 1, y: cy,     dir: 'left'  },
      { x: cx + 1, y: cy,     dir: 'right' },
    ].filter(m => this._canMoveTo(m.x, m.y));

    if (validMoves.length === 0) return;

    // Ghost mob biases movement toward nearest player/bot
    if (this.canGhost) {
      const target = this._findClosestTarget(cx, cy);
      if (target) {
        validMoves.sort((a, b) => {
          const distA = Math.abs(a.x - target.x) + Math.abs(a.y - target.y);
          const distB = Math.abs(b.x - target.x) + Math.abs(b.y - target.y);
          return distA - distB;
        });
        this.targetTx = validMoves[0].x;
        this.targetTy = validMoves[0].y;
        return;
      }
    }

    // Default patrol (avoid immediate 180 flip if straight moves exist)
    const oppositeDir = { up: 'down', down: 'up', left: 'right', right: 'left' }[this.direction];
    const forwardMoves = validMoves.filter(m => m.dir !== oppositeDir);
    const pool = forwardMoves.length > 0 ? forwardMoves : validMoves;

    const chosen = pool[Math.floor(Math.random() * pool.length)];
    this.targetTx = chosen.x;
    this.targetTy = chosen.y;
  }

  _canMoveTo(tx, ty) {
    if (this.map.isWall(tx, ty)) return false;
    if (this.map.isCrate(tx, ty) && !this.canGhost) return false;
    if (this.game.hasBombAt(tx, ty)) return false;
    return true;
  }

  _findClosestTarget(cx, cy) {
    let closest = null;
    let minDist = Infinity;

    const allEntities = [
      this.game.localPlayer,
      ...this.game.remotePlayers.values(),
      ...this.game.botAIs.values(),
    ].filter(e => e && e.alive);

    for (const e of allEntities) {
      const etx = Math.floor(e.px / TILE_SIZE);
      const ety = Math.floor(e.py / TILE_SIZE);
      const dist = Math.abs(cx - etx) + Math.abs(cy - ety);
      if (dist < minDist) {
        minDist = dist;
        closest = { x: etx, y: ety };
      }
    }

    return closest;
  }
}
