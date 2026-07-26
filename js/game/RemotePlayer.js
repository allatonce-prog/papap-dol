// ============================================================
//  PAPAP DOL — Remote Player (Firebase-driven with interpolation)
// ============================================================
import { TILE_SIZE, SPAWN_POSITIONS, PLAYER_COLORS, PLAYER_AVATARS, PLAYER_DARK } from '../utils/constants.js';
import { SnapshotBuffer } from './NetworkOptimizer.js';

export class RemotePlayer {
  constructor(playerId, colorIndex, initialData) {
    this.playerId   = playerId;
    this.colorIndex = colorIndex;

    const spawn = SPAWN_POSITIONS[colorIndex] || SPAWN_POSITIONS[0];
    this.px  = (initialData?.px) ?? (spawn.x * TILE_SIZE + TILE_SIZE/2);
    this.py  = (initialData?.py) ?? (spawn.y * TILE_SIZE + TILE_SIZE/2);

    // High-performance snapshot buffer for smooth Hermite interpolation & dead reckoning
    this.snapshotBuffer = new SnapshotBuffer(12, 40);
    this.snapshotBuffer.push({
      timestamp: Date.now(),
      px: this.px,
      py: this.py,
      vx: initialData?.vx || 0,
      vy: initialData?.vy || 0,
      direction: initialData?.direction || 'down'
    });

    this.direction      = initialData?.direction ?? 'down';
    this.alive          = initialData?.alive ?? true;
    this.speed          = initialData?.speed ?? 180;
    this.bombCapacity   = initialData?.bombCapacity ?? 3;
    this.explosionRange = initialData?.explosionRange ?? 1;
    this.shield         = initialData?.shield ?? false;
    this.canKick        = initialData?.canKick ?? false;
    this.remoteDetonator= initialData?.remoteDetonator ?? false;
    this.canGhost       = initialData?.canGhost ?? false;
    this.extraLives     = initialData?.extraLives ?? 0;
    this.hp             = initialData?.hp ?? 2;
    this.maxHp          = initialData?.maxHp ?? 2;
    this.nickname       = initialData?.nickname ?? '???';
    this.color          = initialData?.color ?? PLAYER_COLORS[colorIndex] ?? '#ffffff';
    this.colorDark      = initialData?.colorDark ?? PLAYER_DARK[colorIndex] ?? '#444444';
    this.avatar         = initialData?.avatar ?? PLAYER_AVATARS[colorIndex] ?? '🙂';
    this.emoji          = initialData?.emoji ?? null;
    this.emojiTime      = initialData?.emojiTime ?? 0;

    this._walkFrame = 0;
    this._deathAnim = 0;   // 0 = alive, >0 = dying animation progress
  }

  /** Called when Firebase pushes a position update */
  onRemoteUpdate(data) {
    if (data.px !== undefined && data.py !== undefined) {
      this.snapshotBuffer.push({
        timestamp: data.ts || Date.now(),
        px: data.px,
        py: data.py,
        vx: data.vx || 0,
        vy: data.vy || 0,
        direction: data.direction || this.direction
      });
    }

    if (data.direction)        this.direction  = data.direction;
    if (data.alive !== undefined) {
      if (this.alive && !data.alive) this._deathAnim = 1;
      this.alive = data.alive;
    }
    if (data.speed !== undefined)          this.speed          = data.speed;
    if (data.bombCapacity !== undefined)   this.bombCapacity   = data.bombCapacity;
    if (data.explosionRange !== undefined) this.explosionRange = data.explosionRange;
    if (data.shield !== undefined)         this.shield         = data.shield;
    if (data.canKick !== undefined)        this.canKick        = data.canKick;
    if (data.remoteDetonator !== undefined)this.remoteDetonator= data.remoteDetonator;
    if (data.canGhost !== undefined)       this.canGhost       = data.canGhost;
    if (data.extraLives !== undefined)     this.extraLives     = data.extraLives;
    if (data.hp !== undefined)             this.hp             = data.hp;
    if (data.emoji !== undefined)          this.emoji          = data.emoji;
    if (data.emojiTime !== undefined)      this.emojiTime      = data.emojiTime;
    if (data.color)                        this.color          = data.color;
    if (data.colorDark)                    this.colorDark      = data.colorDark;
    if (data.avatar)                       this.avatar         = data.avatar;
  }

  update(dt) {
    // Sample high-precision interpolated state from snapshot buffer
    const sample = this.snapshotBuffer.sample();
    if (sample) {
      const prevPx = this.px;
      const prevPy = this.py;

      this.px = sample.px;
      this.py = sample.py;
      if (sample.direction) this.direction = sample.direction;

      const moving = Math.abs(this.px - prevPx) > 0.1 || Math.abs(this.py - prevPy) > 0.1;
      if (moving) this._walkFrame += dt * 8;
    }

    if (this._deathAnim > 0) {
      this._deathAnim = Math.max(0, this._deathAnim - dt * 2);
    }
  }

  get tileX() { return Math.round(this.px / TILE_SIZE); }
  get tileY() { return Math.round(this.py / TILE_SIZE); }
}
