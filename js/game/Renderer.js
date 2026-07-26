// ============================================================
//  PAPAP DOL — Canvas Renderer
// ============================================================
import {
  TILE_SIZE, GRID_W, GRID_H, CANVAS_W, CANVAS_H,
  TILE_EMPTY, TILE_WALL, TILE_CRATE,
  PLAYER_COLORS, PLAYER_DARK,
} from '../utils/constants.js';

export class Renderer {
  constructor(canvas, gameManager) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.game   = gameManager;
    this.theme  = gameManager.map.theme.colors;

    // High DPI / Retina Crisp Display Support
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    canvas.width  = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    canvas.style.width  = CANVAS_W + 'px';
    canvas.style.height = CANVAS_H + 'px';
    this.ctx.scale(dpr, dpr);
  }

  // ── Main render ─────────────────────────────────────────────
  render() {
    const ctx = this.ctx;
    const { game, theme } = this;
    const now = performance.now();

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    this._drawMap(ctx, theme, game.map);
    this._drawPowerUps(ctx, game.powerUps, now);
    this._drawBombs(ctx, game.bombs, theme, now);
    this._drawExplosions(ctx, game.explosions, now);
    this._drawSparks(ctx, game.sparks);
    this._drawMonsters(ctx, game.monsters, now);
    this._drawPlayers(ctx, game, now);
    this._drawWeatherOverlays(ctx, game, now);
  }

  // ── Map ──────────────────────────────────────────────────────
  _drawMap(ctx, theme, map) {
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        const tile = map.getTile(x, y);

        if (tile === TILE_WALL) {
          this._drawWall(ctx, px, py, theme);
        } else if (tile === TILE_CRATE) {
          this._drawCrate(ctx, px, py, theme);
        } else {
          // Floor – checker pattern
          const alt = (x + y) % 2 === 0;
          ctx.fillStyle = alt ? theme.floor : theme.floorAlt;
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  _drawWall(ctx, px, py, theme) {
    const T = TILE_SIZE;
    ctx.fillStyle = theme.wall;
    ctx.fillRect(px, py, T, T);
    // Highlight (top-left bevels)
    ctx.fillStyle = theme.wallHighlight;
    ctx.fillRect(px, py, T, 3);
    ctx.fillRect(px, py, 3, T);
    // Shadow (bottom-right)
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(px, py + T - 3, T, 3);
    ctx.fillRect(px + T - 3, py, 3, T);
    // Inner accent
    ctx.fillStyle = theme.wallAccent;
    ctx.fillRect(px + 4, py + 4, T - 8, T - 8);
  }

  _drawCrate(ctx, px, py, theme) {
    const T = TILE_SIZE;
    ctx.fillStyle = theme.crate;
    ctx.fillRect(px + 1, py + 1, T - 2, T - 2);
    // Wood grain lines
    ctx.strokeStyle = theme.crateLight;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 6, py + 2);  ctx.lineTo(px + 6, py + T - 2);
    ctx.moveTo(px + 14, py + 2); ctx.lineTo(px + 14, py + T - 2);
    ctx.moveTo(px + T - 14, py + 2); ctx.lineTo(px + T - 14, py + T - 2);
    ctx.moveTo(px + T - 6, py + 2);  ctx.lineTo(px + T - 6, py + T - 2);
    ctx.stroke();
    // Border
    ctx.strokeStyle = theme.crateAccent;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, T - 2, T - 2);
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(px + 1, py + 1, T - 2, 4);
  }

  // ── Power-Ups ─────────────────────────────────────────────── 
  _drawPowerUps(ctx, powerUps, now) {
    for (const pu of powerUps.values()) {
      const bob = pu.bobOffset(now);
      const cx  = pu.px;
      const cy  = pu.py + bob;
      const r   = TILE_SIZE * 0.38;

      // Glow
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(now / 400);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.6);
      grad.addColorStop(0, pu.color);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // Background circle
      ctx.fillStyle = pu.color + '33';
      ctx.strokeStyle = pu.color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      // Emoji
      ctx.font = `${TILE_SIZE * 0.5}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(pu.emoji, cx, cy);
    }
  }

  // ── Bombs ─────────────────────────────────────────────────── 
  _drawBombs(ctx, bombs, theme, now) {
    for (const bomb of bombs.values()) {
      const cx = bomb.px;
      const cy = bomb.py;
      const r  = bomb.drawRadius;
      const t  = bomb.fuseProgress;

      // Ambient Fuse Glow Aura
      ctx.save();
      const glowAlpha = 0.2 + 0.15 * Math.sin(now / 100);
      const glowColor = t > 0.7 ? 'rgba(255, 50, 0, ' : 'rgba(255, 170, 0, ';
      const grad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 2.2);
      grad.addColorStop(0, glowColor + (glowAlpha * 1.5) + ')');
      grad.addColorStop(1, glowColor + '0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // Volcano Lava geyser bubbles
      if (bomb.owner === 'volcano') {
        ctx.fillStyle = 'rgba(255, 68, 0, 0.45)';
        ctx.beginPath(); ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2); ctx.fill();

        const pulseRadius = r * (0.8 + 0.35 * Math.sin(now / 150));
        const gradLava = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseRadius);
        gradLava.addColorStop(0, '#ffffff');
        gradLava.addColorStop(0.3, '#ffaa00');
        gradLava.addColorStop(0.7, '#ff3300');
        gradLava.addColorStop(1, 'transparent');
        ctx.fillStyle = gradLava;
        ctx.beginPath(); ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = '#ffcc00';
        for (let i = 0; i < 3; i++) {
          const bx = cx + Math.sin(now/200 + i*2) * r * 0.6;
          const by = cy + Math.cos(now/250 + i*3) * r * 0.6;
          ctx.beginPath(); ctx.arc(bx, by, 2, 0, Math.PI*2); ctx.fill();
        }
        continue;
      }

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(cx, cy + r + 4, r * 0.75, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();

      // Bomb body
      ctx.fillStyle = '#222';
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      // Shine
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(cx - r*0.2, cy - r*0.3, r*0.25, 0, Math.PI*2); ctx.fill();

      // Fuse
      ctx.strokeStyle = '#aa8800';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.quadraticCurveTo(cx + r * 0.4, cy - r * 1.4, cx + r * 0.2, cy - r * 1.8);
      ctx.stroke();

      // Spark (blinking near end)
      if (t > 0.5 || Math.floor(now / 200) % 2 === 0) {
        const sparkAlpha = 0.8 + 0.2 * Math.sin(now / 50);
        ctx.fillStyle = `rgba(255,200,0,${sparkAlpha})`;
        ctx.beginPath(); ctx.arc(cx + r * 0.2, cy - r * 1.8, 4, 0, Math.PI * 2); ctx.fill();
      }

      // Fuse ring (shows countdown)
      ctx.strokeStyle = t > 0.7 ? '#ff3300' : t > 0.4 ? '#ff9900' : '#ffcc00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 4, -Math.PI/2, -Math.PI/2 + (1 - t) * Math.PI * 2);
      ctx.stroke();
    }
  }

  // ── Explosions ───────────────────────────────────────────────
  _drawExplosions(ctx, explosions, now) {
    for (const exp of explosions) {
      const alpha = Math.max(0, exp.life / exp.maxLife);
      
      // Explosion Shockwave Ring
      ctx.save();
      const waveRadius = (1 - alpha) * TILE_SIZE * 1.4;
      ctx.strokeStyle = `rgba(255, 200, 50, ${alpha * 0.6})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(exp.cx, exp.cy, waveRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      const a = exp.alpha;
      ctx.save();
      ctx.globalAlpha = a;

      for (const cell of exp.cells) {
        const px = cell.x * TILE_SIZE;
        const py = cell.y * TILE_SIZE;
        const T  = TILE_SIZE;

        if (cell.isCenter) {
          // Bright center
          const grad = ctx.createRadialGradient(px+T/2, py+T/2, 0, px+T/2, py+T/2, T/2);
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.3, '#ffdd00');
          grad.addColorStop(0.7, '#ff6600');
          grad.addColorStop(1, '#ff2200');
          ctx.fillStyle = grad;
        } else {
          const t = exp.progress;
          const r = Math.round(255);
          const g = Math.round(120 - t * 80);
          ctx.fillStyle = `rgb(${r},${g},0)`;
        }
        ctx.fillRect(px + 1, py + 1, T - 2, T - 2);

        // Inner glow
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(px + T*0.1, py + T*0.1, T*0.8, T*0.8);
      }

      ctx.restore();
    }
  }

  // ── Monsters / Mobs ──────────────────────────────────────────
  _drawMonsters(ctx, monsters, now) {
    if (!monsters) return;
    for (const m of monsters.values()) {
      if (!m.alive) continue;
      const cx = m.px;
      const cy = m.py;
      const r  = TILE_SIZE * 0.38;

      // Glow & Pulsing shadow
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(now / 200);
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(cx, cy + r + 4, r * 0.6, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();

      // Mob Body Circle
      ctx.fillStyle = m.color + '44';
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      // Mob Emoji
      const bob = Math.sin(now / 150) * 3;
      ctx.font = `${r * 1.3}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.emoji, cx, cy + bob);
    }
  }

  // ── Sparks ───────────────────────────────────────────────────
  _drawSparks(ctx, sparks) {
    for (const s of sparks) {
      ctx.save();
      ctx.globalAlpha = s.life;
      ctx.fillStyle   = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur  = 6;
      ctx.beginPath();
      ctx.arc(s.px, s.py, s.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Players ──────────────────────────────────────────────────
  _drawPlayers(ctx, game, now) {
    const allPlayers = [
      ...game.remotePlayers.values(),
      game.localPlayer,
    ].filter(Boolean);

    for (const p of allPlayers) {
      if (!p.alive) {
        this._drawDeadPlayer(ctx, p);
        continue;
      }
      this._drawPlayer(ctx, p, p.playerId === game.localPlayerId, now);
    }
  }

  _drawPlayer(ctx, p, isLocal, now) {
    const cx = p.px;
    const cy = p.py;
    const T  = TILE_SIZE;
    const r  = T * 0.38;
    const color = p.color || PLAYER_COLORS[p.colorIndex] || '#ffffff';
    const dark  = p.colorDark || PLAYER_DARK[p.colorIndex] || '#444444';

    // Power-up Aura Buff Effects
    if (p.speed && p.speed > 200) {
      ctx.save();
      ctx.strokeStyle = `rgba(0, 230, 255, ${0.5 + 0.3 * Math.sin(now / 120)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Bobbing shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(cx, cy + r + 6, r * 0.7, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();

    // Shield glow
    if (p.shield) {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(now / 200);
      ctx.strokeStyle = '#8866ff';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#8866ff';
      ctx.shadowBlur = 15;
      ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // Local player indicator (glowing neon cursor ring)
    if (isLocal) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Damage Invulnerability Flashing (i-frames)
    if (p.invulnerableUntil && now < p.invulnerableUntil) {
      ctx.save();
      ctx.globalAlpha = Math.floor(now / 80) % 2 === 0 ? 0.3 : 1.0;
    }

    // Body
    ctx.fillStyle = color;
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Face highlight
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(cx - r*0.25, cy - r*0.25, r*0.35, 0, Math.PI*2); ctx.fill();

    // Custom Avatar Emoji drawing
    ctx.font = `${r * 1.35}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.avatar || '🙂', cx, cy + r * 0.05);

    if (p.invulnerableUntil && now < p.invulnerableUntil) {
      ctx.restore();
    }

    // Draw HP Heart Bar (Hit 1 = 1 HP / Half Heart 💔, Hit 2 = Dead)
    const hp = p.hp ?? 2;
    const heartDisplay = hp >= 2 ? '❤️' : '💔';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(heartDisplay, cx, cy - r - 12);

    // Nickname
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#000';
    ctx.fillText(p.nickname || '', cx + 1, cy - r - 3);
    ctx.fillStyle = color;
    ctx.fillText(p.nickname || '', cx, cy - r - 4);

    // Draw emoji quick chat speech bubble
    if (p.emoji && p.emojiTime && (Date.now() - p.emojiTime < 2500)) {
      const bx = cx;
      const by = cy - r - 26;
      
      // Draw speech bubble background
      ctx.fillStyle = 'rgba(10, 10, 22, 0.85)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(bx - 16, by - 16, 32, 26, 6);
      } else {
        ctx.rect(bx - 16, by - 16, 32, 26);
      }
      ctx.fill();
      ctx.stroke();

      // Bubble tail pointing down
      ctx.fillStyle = 'rgba(10, 10, 22, 0.85)';
      ctx.beginPath();
      ctx.moveTo(bx - 4, by + 10);
      ctx.lineTo(bx + 4, by + 10);
      ctx.lineTo(bx, by + 15);
      ctx.closePath();
      ctx.fill();

      // Draw tail border
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(bx - 4, by + 10);
      ctx.lineTo(bx, by + 15);
      ctx.lineTo(bx + 4, by + 10);
      ctx.stroke();

      // Draw Emoji
      ctx.font = '14px Arial, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.emoji, bx, by - 3);
    }
  }

  _drawDeadPlayer(ctx, p) {
    const cx = p.px;
    const cy = p.py;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.font = `${TILE_SIZE * 0.6}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💀', cx, cy);
    ctx.restore();
  }

  _eyeOffset(dir) {
    switch (dir) {
      case 'up'   : return { lx: -5, ly: -5, rx:  5, ry: -5 };
      case 'down' : return { lx: -5, ly:  3, rx:  5, ry:  3 };
      case 'left' : return { lx: -5, ly: -2, rx:  0, ry: -2 };
      case 'right': return { lx:  0, ly: -2, rx:  5, ry: -2 };
      default     : return { lx: -5, ly:  0, rx:  5, ry:  0 };
    }
  }

  _drawWeatherOverlays(ctx, game, now) {
    if (game.map.name === 'Desert') {
      const cycleTime = 16000;
      const stormDuration = 4000;
      const inCycle = (Date.now()) % cycleTime;
      if (inCycle < stormDuration) {
        // Sandstorm warning / storm active
        const progress = inCycle / stormDuration;
        // Fade wind in and out smoothly
        const alpha = Math.min(0.2, 0.45 * Math.sin(progress * Math.PI));
        ctx.fillStyle = `rgba(210, 180, 140, ${alpha})`;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Sweeping wind lines
        ctx.strokeStyle = `rgba(240, 220, 180, ${alpha * 1.5})`;
        ctx.lineWidth = 2;
        const windProgress = (Date.now() / 800) % 1.0;
        for (let i = -CANVAS_W; i < CANVAS_W; i += 60) {
          ctx.beginPath();
          const startX = i + windProgress * 60;
          ctx.moveTo(startX, 0);
          ctx.lineTo(startX + 120, CANVAS_H);
          ctx.stroke();
        }
      }
    }
  }

  // ── HUD ──────────────────────────────────────────────────────
  updateHUD(localPlayer, remotePlayers, localPlayerId) {
    const hud = document.getElementById('game-hud');
    if (!hud) return;

    const all = [];
    remotePlayers.forEach((p, id) => all.push({ p, isLocal: false }));
    if (localPlayer) all.push({ p: localPlayer, isLocal: true });
    all.sort((a,b) => a.p.colorIndex - b.p.colorIndex);

    hud.innerHTML = all.map(({ p, isLocal }) => {
      const pColor = p.color || PLAYER_COLORS[p.colorIndex] || '#ffffff';
      return `
        <div class="hud-player${isLocal ? ' local-player' : ''}${!p.alive ? ' eliminated' : ''}"
             style="border-color:${p.alive ? pColor + '44' : 'transparent'}">
          <div class="hud-color-swatch" style="background:${pColor};display:flex;align-items:center;justify-content:center;font-size:0.4rem;padding-bottom:1px">
            ${p.avatar || '🙂'}
          </div>
          <span class="hud-nick" style="color:${pColor}">${esc(p.nickname || '?')}</span>
          ${p.alive ? `
            <span class="hud-stat"><span class="hud-stat-icon">💣</span>${p.bombCapacity}</span>
            <span class="hud-stat"><span class="hud-stat-icon">🔥</span>${p.explosionRange}</span>
            ${p.shield ? '<span class="hud-stat">🛡️</span>' : ''}
            ${p.remoteDetonator ? '<span class="hud-stat">⏰</span>' : ''}
            ${p.canKick ? '<span class="hud-stat">🦵</span>' : ''}
            ${p.canGhost ? '<span class="hud-stat">👻</span>' : ''}
            ${p.extraLives > 0 ? `<span class="hud-stat">❤️${p.extraLives}</span>` : ''}
          ` : '<span style="color:var(--accent-red);font-size:0.5rem">ELIMINATED</span>'}
        </div>
      `;
    }).join('');
  }
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
}
