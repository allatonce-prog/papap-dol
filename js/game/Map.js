// ============================================================
//  PAPAP DOL — Map Generator
// ============================================================
import {
  TILE_EMPTY, TILE_WALL, TILE_CRATE,
  GRID_W, GRID_H, TILE_SIZE,
  SPAWN_SAFE_TILES,
} from '../utils/constants.js';
import { seededRng } from '../utils/names.js';
import { classic }   from '../../assets/maps/classic.js';
import { ice }       from '../../assets/maps/ice.js';
import { desert }    from '../../assets/maps/desert.js';
import { volcano }   from '../../assets/maps/volcano.js';
import { factory }   from '../../assets/maps/factory.js';

const MAP_THEMES = { Classic: classic, Ice: ice, Desert: desert, Volcano: volcano, Factory: factory };

export class GameMap {
  constructor(mapName, mapSeed) {
    this.name   = mapName;
    this.seed   = mapSeed;
    this.theme  = MAP_THEMES[mapName] || classic;
    this.grid   = [];   // 2D array [y][x]
    this._generate();
  }

  _generate() {
    const rng = seededRng(this.seed);
    const { crateChance } = this.theme;
    const grid = [];

    for (let y = 0; y < GRID_H; y++) {
      grid[y] = [];
      for (let x = 0; x < GRID_W; x++) {
        if (this._isHardWall(x, y)) {
          grid[y][x] = TILE_WALL;
        } else if (this._isSafeZone(x, y)) {
          grid[y][x] = TILE_EMPTY;
        } else if (rng() < crateChance) {
          grid[y][x] = TILE_CRATE;
        } else {
          grid[y][x] = TILE_EMPTY;
        }
      }
    }

    this.grid = grid;
  }

  _isHardWall(x, y) {
    // Border
    if (x === 0 || x === GRID_W-1 || y === 0 || y === GRID_H-1) return true;
    // Pillar grid (every even x AND even y inside border)
    if (x % 2 === 0 && y % 2 === 0) return true;
    return false;
  }

  _isSafeZone(x, y) {
    return SPAWN_SAFE_TILES.has(`${x},${y}`);
  }

  // ── Queries ─────────────────────────────────────────────────
  getTile(x, y) {
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return TILE_WALL;
    return this.grid[y][x];
  }

  isWall(x, y)  { return this.getTile(x,y) === TILE_WALL; }
  isCrate(x, y) { return this.getTile(x,y) === TILE_CRATE; }
  isEmpty(x, y) { return this.getTile(x,y) === TILE_EMPTY; }
  isSolid(x, y) { const t = this.getTile(x,y); return t === TILE_WALL || t === TILE_CRATE; }

  /** Check if pixel position overlaps any solid tile (accounts for hitbox) */
  isPixelSolid(px, py, hitboxFrac = 0.72) {
    const half = (TILE_SIZE * hitboxFrac) / 2;
    const corners = [
      { x: px - half + 1, y: py - half + 1 },
      { x: px + half - 1, y: py - half + 1 },
      { x: px - half + 1, y: py + half - 1 },
      { x: px + half - 1, y: py + half - 1 },
    ];
    for (const c of corners) {
      if (this.isSolid(Math.floor(c.x / TILE_SIZE), Math.floor(c.y / TILE_SIZE))) return true;
    }
    return false;
  }

  /** Apply a set of destroyed crate keys ("x_y") from Firebase */
  applyDestroyedCrates(destroyedCrates) {
    if (!destroyedCrates) return;
    for (const key of Object.keys(destroyedCrates)) {
      const [x, y] = key.split('_').map(Number);
      if (this.isCrate(x, y)) this.grid[y][x] = TILE_EMPTY;
    }
  }

  /** Destroy a single crate tile */
  destroyCrate(x, y) {
    if (this.isCrate(x, y)) { this.grid[y][x] = TILE_EMPTY; return true; }
    return false;
  }

  /** Calculate explosion cells from a bomb position */
  calcExplosionCells(bx, by, range) {
    const cells = [{ x: bx, y: by, isCenter: true, dir: 'center' }];
    const dirs  = [
      { dx: 0, dy: -1, dir: 'up'    },
      { dx: 0, dy:  1, dir: 'down'  },
      { dx:-1, dy:  0, dir: 'left'  },
      { dx: 1, dy:  0, dir: 'right' },
    ];
    for (const { dx, dy, dir } of dirs) {
      for (let i = 1; i <= range; i++) {
        const cx = bx + dx * i;
        const cy = by + dy * i;
        if (this.isWall(cx, cy)) break;           // stop at hard wall
        cells.push({ x: cx, y: cy, isEnd: i === range, dir });
        if (this.isCrate(cx, cy)) break;          // stop after crate (but include it)
      }
    }
    return cells;
  }
}
