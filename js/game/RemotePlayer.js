// ============================================================
//  PAPAP DOL — Remote Player (Firebase-driven with interpolation)
// ============================================================
import { TILE_SIZE, SPAWN_POSITIONS, PLAYER_COLORS, PLAYER_AVATARS, PLAYER_DARK } from '../utils/constants.js';

export class RemotePlayer {
  constructor(playerId, colorIndex, initialData) {
    this.playerId   = playerId;
    this.colorIndex = colorIndex;

    const spawn = SPAWN_POSITIONS[colorIndex] || SPAWN_POSITIONS[0];
    this.px  = (initialData?.px) ?? (spawn.x * TILE_SIZE + TILE_SIZE/2);
    this.py  = (initialData?.py) ?? (spawn.y * TILE_SIZE + TILE_SIZE/2);

    // Interpolation targets
    this._targetPx = this.px;
    this._targetPy = this.py;

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
    if (data.px !== undefined) this._targetPx = data.px;
    if (data.py !== undefined) this._targetPy = data.py;
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
    if (data.emoji !== undefined)          this.emoji          = data.emoji;
    if (data.emojiTime !== undefined)      this.emojiTime      = data.emojiTime;
    if (data.color)                        this.color          = data.color;
    if (data.colorDark)                    this.colorDark      = data.colorDark;
    if (data.avatar)                       this.avatar         = data.avatar;
  }

  update(dt) {
    // Smooth interpolation toward Firebase target (lerp factor based on speed)
    const lerp = Math.min(1, dt * 14);
    this.px += (this._targetPx - this.px) * lerp;
    this.py += (this._targetPy - this.py) * lerp;

    const moving = Math.abs(this._targetPx - this.px) > 1 || Math.abs(this._targetPy - this.py) > 1;
    if (moving) this._walkFrame += dt * 8;

    if (this._deathAnim > 0) {
      this._deathAnim = Math.max(0, this._deathAnim - dt * 2);
    }
  }

  get tileX() { return Math.round(this.px / TILE_SIZE); }
  get tileY() { return Math.round(this.py / TILE_SIZE); }
}
