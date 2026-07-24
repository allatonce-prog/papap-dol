// ============================================================
//  PAPAP DOL — Game Manager (orchestrates everything)
// ============================================================
import { GameMap }      from './Map.js';
import { Player, KEYS } from './Player.js';
import { RemotePlayer } from './RemotePlayer.js';
import { Bomb, Explosion, Spark } from './Bomb.js';
import { PowerUp }      from './PowerUp.js';
import { Renderer }     from './Renderer.js';
import { MobileControls } from './MobileControls.js';
import { BotAI }          from './BotAI.js';
import {
  TILE_SIZE, CANVAS_W, CANVAS_H,
  SYNC_INTERVAL_MS, SPAWN_POSITIONS,
  POWERUP_POOL, POWERUP_SPAWN_CHANCE,
  PLAYER_COLORS, PLAYER_AVATARS, PLAYER_DARK,
} from '../utils/constants.js';
import {
  watchRoom, updatePlayer, placeBomb as fbPlaceBomb,
  removeBomb as fbRemoveBomb, destroyCrate as fbDestroyCrate,
  spawnPowerUp as fbSpawnPowerUp, collectPowerUp as fbCollectPowerUp,
  setWinner, updateRoom, deleteRoom, removePlayer,
  setupHostRoomPresence, sendChatMessage, watchChat,
} from '../firebase.js';
import {
  sfxExplosion, sfxDeath, sfxPowerUp, sfxBombPlace,
} from './Audio.js';

export class GameManager {
  constructor(roomId, localPlayerId, isHost, roomData) {
    this.roomId        = roomId;
    this.localPlayerId = localPlayerId;
    this.isHost        = isHost;
    this.roomData      = roomData;

    // Map
    this.map = new GameMap(roomData.map || 'Classic', roomData.mapSeed || 0);
    this.map.applyDestroyedCrates(roomData.destroyedCrates);

    this.mapPixelW = CANVAS_W;
    this.mapPixelH = CANVAS_H;

    // Entities
    this.bombs        = new Map();  // id → Bomb
    this.powerUps     = new Map();  // id → PowerUp
    this.explosions   = [];         // Explosion[]
    this.sparks       = [];         // Spark[]
    this.remotePlayers= new Map();  // playerId → RemotePlayer
    this.localPlayer  = null;
    this.botAIs       = new Map();  // botId → BotAI (host only)

    // Game state
    this.running      = false;
    this._rafId       = null;
    this._syncTimer   = 0;
    this._lastTime    = 0;
    this._unsubRoom   = null;
    this._gameOver    = false;
    this._processedExplosions = new Set(); // bomb IDs already exploded locally
    this._mobileControls      = null;
    this._cancelHostPresence  = null; // fn to cancel onDisconnect room removal

    // Renderer
    const canvas = document.getElementById('game-canvas');
    this.renderer = new Renderer(canvas, this);

    this._unsubChat = null;
    this._chatKeyHandler = null;
  }

  // ── Start ─────────────────────────────────────────────────── 
  start() {
    this.running   = true;
    this._lastTime = performance.now();

    // Build local and remote players from roomData
    const players = this.roomData.players || {};
    Object.entries(players).forEach(([pid, pdata]) => {
      if (pid === this.localPlayerId) {
        this.localPlayer = new Player(pid, pdata.colorIndex, this);
        // Restore stats if reconnecting
        this.localPlayer.speed          = pdata.speed          ?? 180;
        this.localPlayer.bombCapacity   = pdata.bombCapacity   ?? 3;
        this.localPlayer.explosionRange = pdata.explosionRange ?? 1;
        this.localPlayer.shield         = pdata.shield         ?? false;
        this.localPlayer.canKick        = pdata.canKick        ?? false;
        this.localPlayer.remoteDetonator= pdata.remoteDetonator?? false;
        this.localPlayer.canGhost       = pdata.canGhost       ?? false;
        this.localPlayer.extraLives     = pdata.extraLives     ?? 0;
        this.localPlayer.nickname       = pdata.nickname       || 'Player';
        this.localPlayer.color          = pdata.color          || PLAYER_COLORS[pdata.colorIndex];
        this.localPlayer.colorDark      = pdata.colorDark      || PLAYER_DARK[pdata.colorIndex];
        this.localPlayer.avatar         = pdata.avatar         || PLAYER_AVATARS[pdata.colorIndex];
      } else {
        const rp = new RemotePlayer(pid, pdata.colorIndex, pdata);
        rp.nickname = pdata.nickname || 'Player';
        this.remotePlayers.set(pid, rp);
      }
    });

    // Load existing bombs
    Object.entries(this.roomData.bombs || {}).forEach(([id, b]) => {
      this.bombs.set(id, new Bomb(id, b, this.map));
    });

    // Load existing power-ups
    Object.entries(this.roomData.powerUps || {}).forEach(([id, p]) => {
      this.powerUps.set(id, new PowerUp(id, p));
    });

    // Mobile controls (only on touch devices)
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      this._mobileControls = new MobileControls(KEYS);
    }

    // Host: bot setup & auto-delete room on disconnect
    if (this.isHost) {
      this._cancelHostPresence = setupHostRoomPresence(this.roomId);
      Object.entries(players).forEach(([pid, pdata]) => {
        if (pid.startsWith('bot_')) {
          const spawn = SPAWN_POSITIONS[pdata.colorIndex] || SPAWN_POSITIONS[0];
          const initialData = {
            ...pdata,
            px: spawn.x * TILE_SIZE + TILE_SIZE / 2,
            py: spawn.y * TILE_SIZE + TILE_SIZE / 2
          };
          this.botAIs.set(pid, new BotAI(pid, pdata.colorIndex, initialData, this));
        }
      });
    }

    // Wire quick emoji chat buttons
    document.querySelectorAll('#emoji-quick-chat .emoji-btn').forEach(btn => {
      // Use clean event handler
      const handler = () => {
        const emoji = btn.getAttribute('data-emoji');
        if (this.localPlayer && this.localPlayer.alive) {
          this.localPlayer.emoji = emoji;
          this.localPlayer.emojiTime = Date.now();
          this._syncToFirebase();
        }
      };
      btn.onclick = handler;
    });



    // Wire in-game settings + exit buttons
    document.getElementById('btn-ingame-settings')?.addEventListener('click', () => {
      import('../menu.js').then(m => m.openModal('settings-modal'));
    });
    document.getElementById('btn-ingame-exit')?.addEventListener('click', () => {
      if (confirm(this.isHost
        ? 'You are the host. Leaving will DELETE the room for everyone. Exit?'
        : 'Leave the game?')) {
        this._handleExit();
      }
    });

    // Subscribe to Firebase
    this._unsubRoom = watchRoom(this.roomId, snap => this._onRoomUpdate(snap));

    // Start loop
    this._rafId = requestAnimationFrame(t => this._loop(t));
  }

  // ── Main Loop ─────────────────────────────────────────────── 
  _loop(now) {
    if (!this.running) return;

    const dt = Math.min((now - this._lastTime) / 1000, 0.08);
    this._lastTime = now;

    this._update(dt, now);
    this.renderer.render();

    // Throttled HUD update
    this.renderer.updateHUD(this.localPlayer, this.remotePlayers, this.localPlayerId);

    // Firebase sync at ~15fps
    this._syncTimer += dt;
    if (this._syncTimer >= SYNC_INTERVAL_MS / 1000) {
      this._syncTimer = 0;
      this._syncToFirebase();
    }

    this._rafId = requestAnimationFrame(t => this._loop(t));
  }

  // ── Update ─────────────────────────────────────────────────── 
  _update(dt, now) {
    // Local player
    if (this.localPlayer?.alive) {
      this.localPlayer.update(dt);
      this._checkLocalPlayerCollectPowerUp();
    }

    // Remote players
    this.remotePlayers.forEach(rp => rp.update(dt));

    // Bombs
    this.bombs.forEach(bomb => {
      bomb.update(dt);
      if (bomb.shouldExplode && !this._processedExplosions.has(bomb.id)) {
        this._processedExplosions.add(bomb.id);
        this._triggerExplosion(bomb);
      }
    });

    // Explosions (local visual)
    this.explosions.forEach(e => e.update());
    this.explosions = this.explosions.filter(e => e.alive);

    // Sparks
    this.sparks.forEach(s => s.update(dt));
    this.sparks = this.sparks.filter(s => s.alive);

    // Power-ups expiry
    this.powerUps.forEach((pu, id) => {
      if (pu.isExpired && !pu.collected) {
        pu.collected = true;
        fbCollectPowerUp(this.roomId, id).catch(() => {});
        this.powerUps.delete(id);
      }
    });

    // Check if local player in explosion
    if (this.localPlayer?.alive) {
      for (const exp of this.explosions) {
        if (exp.containsTile(this.localPlayer.tileX, this.localPlayer.tileY)) {
          this._killLocalPlayer();
          break;
        }
      }
    }

    // Update bot AIs (host only)
    if (this.isHost && this.botAIs.size > 0) {
      this.botAIs.forEach((bot, id) => {
        if (bot.alive) {
          // Check if bot got hit by any explosion
          for (const exp of this.explosions) {
            const bx = Math.floor(bot.px / TILE_SIZE);
            const by = Math.floor(bot.py / TILE_SIZE);
            if (exp.containsTile(bx, by)) {
              bot.alive = false;
              sfxDeath();
              updatePlayer(this.roomId, id, { alive: false }).catch(() => {});
              break;
            }
          }
        }
        if (bot.alive) {
          bot.update(dt);
          // Check if bot collects power-up
          this.powerUps.forEach((pu, puid) => {
            if (!pu.collected && pu.overlapsPlayer(bot.px, bot.py)) {
              pu.collected = true;
              this.powerUps.delete(puid);
              sfxPowerUp();
              fbCollectPowerUp(this.roomId, puid).catch(() => {});
            }
          });
        }
      });
    }

    // Check winner (host only writes it)
    if (!this._gameOver) this._checkWinner();
  }

  // ── Firebase Sync ─────────────────────────────────────────── 
  _syncToFirebase() {
    if (!this.localPlayer) return;
    const data = this.localPlayer.toFirebase();
    updatePlayer(this.roomId, this.localPlayerId, data).catch(() => {});

    // Sync bots to Firebase (host only)
    if (this.isHost && this.botAIs.size > 0) {
      this.botAIs.forEach((bot, id) => {
        if (bot.alive) {
          updatePlayer(this.roomId, id, bot.toFirebase()).catch(() => {});
        }
      });
    }
  }

  // ── Firebase Room Updates ─────────────────────────────────── 
  _onRoomUpdate(room) {
    if (!this.running) return;

    // Room was deleted → host left, kick everyone back to menu
    if (!room) {
      this._gameOver = true;
      this.destroy();
      alert('The host left. Returning to menu.');
      import('../main.js').then(({ appState, showScreen }) => {
        appState.roomId   = null;
        appState.isHost   = false;
        appState.roomData = null;
        showScreen('menu-screen');
      });
      return;
    }

    if (room.status === 'finished' && room.winner) {
      this._showWinner(room.winner);
      return;
    }

    const players = room.players || {};

    // Sync remote players
    Object.entries(players).forEach(([pid, pdata]) => {
      if (pid === this.localPlayerId) return;
      if (this.remotePlayers.has(pid)) {
        this.remotePlayers.get(pid).onRemoteUpdate(pdata);
      } else {
        // New player joined mid-game (shouldn't happen but handle gracefully)
        const rp = new RemotePlayer(pid, pdata.colorIndex, pdata);
        rp.nickname = pdata.nickname || 'Player';
        this.remotePlayers.set(pid, rp);
      }
    });

    // Remove disconnected remote players
    this.remotePlayers.forEach((_, pid) => {
      if (!players[pid]) this.remotePlayers.delete(pid);
    });

    // Sync bombs (add new, remove exploded)
    const fbBombs = room.bombs || {};
    // Add new bombs from other players
    Object.entries(fbBombs).forEach(([id, b]) => {
      if (!this.bombs.has(id)) {
        this.bombs.set(id, new Bomb(id, b, this.map));
      } else {
        const existing = this.bombs.get(id);
        existing.x = b.x;
        existing.y = b.y;
      }
    });
    // Remove bombs no longer in DB
    this.bombs.forEach((bomb, id) => {
      if (id.startsWith('temp_')) return;
      if (!fbBombs[id]) {
        if (bomb.owner === this.localPlayerId && this.localPlayer) {
          this.localPlayer.onBombExploded(id);
        }
        this.bombs.delete(id);
      }
    });

    // Sync power-ups
    const fbPUs = room.powerUps || {};
    Object.entries(fbPUs).forEach(([id, p]) => {
      if (!this.powerUps.has(id)) {
        this.powerUps.set(id, new PowerUp(id, p));
      }
    });
    this.powerUps.forEach((_, id) => {
      if (!fbPUs[id]) this.powerUps.delete(id);
    });

    // Apply destroyed crates
    if (room.destroyedCrates) {
      this.map.applyDestroyedCrates(room.destroyedCrates);
    }
  }

  // ── Bomb Placement (local player) ────────────────────────── 
  onLocalBombPlaced(bombData) {
    const tempId = `temp_${Date.now()}`;
    const tempBomb = new Bomb(tempId, bombData, this.map);
    this.bombs.set(tempId, tempBomb);

    fbPlaceBomb(this.roomId, bombData).then(id => {
      this.bombs.delete(tempId);
      if (id) {
        const bomb = new Bomb(id, bombData, this.map);
        this.bombs.set(id, bomb);
      }
    }).catch(err => {
      console.error('Bomb place err:', err);
      this.bombs.delete(tempId);
      if (this.localPlayer) {
        this.localPlayer.onBombExploded(null);
      }
    });
  }

  hasBombAt(tx, ty) {
    for (const b of this.bombs.values()) {
      if (b.x === tx && b.y === ty) return true;
    }
    return false;
  }

  kickBomb(tx, ty, dir) {
    let targetBomb = null;
    this.bombs.forEach(b => {
      if (b.x === tx && b.y === ty) targetBomb = b;
    });
    if (!targetBomb) return;

    // Avoid double kicks if already sliding
    const targetPx = targetBomb.x * TILE_SIZE + TILE_SIZE / 2;
    const targetPy = targetBomb.y * TILE_SIZE + TILE_SIZE / 2;
    if (Math.abs(targetBomb.visualPx - targetPx) > 5 || Math.abs(targetBomb.visualPy - targetPy) > 5) {
      return;
    }

    let dx = 0, dy = 0;
    if (dir === 'up')    dy = -1;
    if (dir === 'down')  dy = 1;
    if (dir === 'left')  dx = -1;
    if (dir === 'right') dx = 1;
    if (dx === 0 && dy === 0) return;

    let destX = tx;
    let destY = ty;

    while (true) {
      const nextX = destX + dx;
      const nextY = destY + dy;

      if (this.map.isWall(nextX, nextY)) break;
      if (this.map.isCrate(nextX, nextY)) break;
      if (this.hasBombAt(nextX, nextY)) break;

      // Check if a player is standing on the next tile
      let playerOnTile = false;
      const allPlayers = [
        ...this.remotePlayers.values(),
        this.localPlayer
      ].filter(Boolean);
      for (const p of allPlayers) {
        if (p.alive) {
          const ptx = Math.round(p.px / TILE_SIZE);
          const pty = Math.round(p.py / TILE_SIZE);
          if (ptx === nextX && pty === nextY) {
            playerOnTile = true;
            break;
          }
        }
      }
      if (playerOnTile) break;

      destX = nextX;
      destY = nextY;
    }

    if (destX !== tx || destY !== ty) {
      updateRoom(this.roomId, {
        [`bombs/${targetBomb.id}/x`]: destX,
        [`bombs/${targetBomb.id}/y`]: destY
      }).catch(() => {});
    }
  }

  // ── Explosion ─────────────────────────────────────────────── 
  _triggerExplosion(bomb) {
    const cells = this.map.calcExplosionCells(bomb.x, bomb.y, bomb.range);
    const exp   = new Explosion(cells);
    this.explosions.push(exp);

    sfxExplosion();
    this._screenShake();

    // Spawn sparks at center
    for (let i = 0; i < 20; i++) {
      this.sparks.push(new Spark(bomb.px, bomb.py));
    }

    // Destroy crates + spawn power-ups
    const crateDestructions = [];
    for (const cell of cells) {
      if (this.map.isCrate(cell.x, cell.y)) {
        this.map.destroyCrate(cell.x, cell.y);
        crateDestructions.push({ x: cell.x, y: cell.y });
        // Remove power-ups inside this crate (shouldn't normally have one, but defensive)
        this.powerUps.forEach((pu, id) => {
          if (pu.x === cell.x && pu.y === cell.y) {
            this.powerUps.delete(id);
            fbCollectPowerUp(this.roomId, id).catch(() => {});
          }
        });
      }
    }

    // Write to Firebase (all clients write idempotent truths)
    crateDestructions.forEach(({ x, y }) => {
      fbDestroyCrate(this.roomId, x, y).catch(() => {});
      // Spawn power-up with probability
      if (Math.random() < POWERUP_SPAWN_CHANCE) {
        const type = POWERUP_POOL[Math.floor(Math.random() * POWERUP_POOL.length)];
        const puData = { type, x, y, spawnedAt: Date.now() };
        // Only bomb owner spawns power-ups to avoid duplicates
        if (bomb.owner === this.localPlayerId) {
          fbSpawnPowerUp(this.roomId, puData).catch(() => {});
        }
      }
    });

    // Remove bomb from DB (bomb owner does it, or host as fallback)
    if (bomb.owner === this.localPlayerId || this.isHost) {
      fbRemoveBomb(this.roomId, bomb.id).catch(() => {});
    }
    this.bombs.delete(bomb.id);

    // Notify player they can place another bomb
    if (bomb.owner === this.localPlayerId && this.localPlayer) {
      this.localPlayer.onBombExploded(bomb.id);
    }

    // Chain: trigger adjacent bombs that are in explosion cells
    cells.forEach(cell => {
      this.bombs.forEach(other => {
        if (other.x === cell.x && other.y === cell.y && !this._processedExplosions.has(other.id)) {
          this._processedExplosions.add(other.id);
          setTimeout(() => this._triggerExplosion(other), 80);
        }
      });
    });
  }

  // ── Remote Detonate ───────────────────────────────────────── 
  detonateRemoteBombs(ownerId) {
    this.bombs.forEach(bomb => {
      if (bomb.owner === ownerId && bomb.remote && !this._processedExplosions.has(bomb.id)) {
        this._processedExplosions.add(bomb.id);
        this._triggerExplosion(bomb);
      }
    });
  }

  // ── Power-up Collection ───────────────────────────────────── 
  _checkLocalPlayerCollectPowerUp() {
    const lp = this.localPlayer;
    if (!lp?.alive) return;
    this.powerUps.forEach((pu, id) => {
      if (!pu.collected && pu.overlapsPlayer(lp.px, lp.py)) {
        pu.collected = true;
        lp.applyPowerUp(pu.type);
        this.powerUps.delete(id);
        sfxPowerUp();
        this._showPUToast(pu.emoji, pu.type);
        fbCollectPowerUp(this.roomId, id).catch(() => {});
      }
    });
  }

  // ── Player Death ──────────────────────────────────────────── 
  _killLocalPlayer() {
    if (!this.localPlayer) return;
    const died = this.localPlayer.die();
    if (!died) return;  // shield/extra life absorbed

    sfxDeath();
    this._showEliminationBanner();
    updatePlayer(this.roomId, this.localPlayerId, { alive: false }).catch(() => {});
  }

  // ── Winner Check ──────────────────────────────────────────── 
  _checkWinner() {
    if (!this.isHost || this._gameOver) return;

    const allPlayers = this.roomData?.players || {};
    const allPids    = Object.keys(allPlayers);
    if (allPids.length < 2) return;

    // Collect alive status from local and remote
    const aliveMap = {};
    this.remotePlayers.forEach((rp, pid) => { aliveMap[pid] = rp.alive; });
    if (this.localPlayer) aliveMap[this.localPlayerId] = this.localPlayer.alive;

    const alivePids = allPids.filter(pid => aliveMap[pid] !== false);

    if (alivePids.length === 1) {
      this._gameOver = true;
      const winnerPid  = alivePids[0];
      const winnerNick = allPlayers[winnerPid]?.nickname
        || (winnerPid === this.localPlayerId ? this.localPlayer?.nickname : null)
        || 'Unknown';
      setWinner(this.roomId, winnerNick).catch(() => {});
    } else if (alivePids.length === 0) {
      // Draw
      this._gameOver = true;
      setWinner(this.roomId, 'Nobody (Draw)').catch(() => {});
    }
  }

  _showWinner(nick) {
    if (this._gameOver && !this.running) return;
    this._gameOver = true;
    this.destroy();
    // Dynamic import to avoid circular refs
    import('../lobby.js').then(m => m.showWinnerScreen(nick)).catch(() => {});
  }

  // ── Screen Shake ─────────────────────────────────────────── 
  _screenShake() {
    const wrapper = document.getElementById('canvas-wrapper');
    if (!wrapper) return;
    wrapper.classList.add('shake');
    setTimeout(() => wrapper.classList.remove('shake'), 320);
  }

  // ── UI Helpers ────────────────────────────────────────────── 
  _showEliminationBanner() {
    const banner = document.getElementById('elim-banner');
    if (!banner) return;
    banner.classList.add('show');
    setTimeout(() => banner.classList.remove('show'), 2500);
  }

  _showPUToast(emoji, type) {
    const toast = document.getElementById('pu-toast');
    if (!toast) return;
    toast.textContent = `${emoji} ${type.toUpperCase()} UP!`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1800);
  }

  // ── Exit Game (intentional) ──────────────────────────────────
  async _handleExit() {
    // Cancel the onDisconnect room removal BEFORE we delete manually
    if (this._cancelHostPresence) {
      try { await this._cancelHostPresence(); } catch { /* ignore */ }
    }
    this.destroy();
    try {
      if (this.isHost) {
        await deleteRoom(this.roomId);
      } else {
        await removePlayer(this.roomId, this.localPlayerId);
      }
    } catch { /* ignore */ }
    const { appState, showScreen } = await import('../main.js');
    appState.roomId   = null;
    appState.isHost   = false;
    appState.roomData = null;
    showScreen('menu-screen');
  }

  // ── Cleanup ─────────────────────────────────────────────────── 
  destroy() {
    this.running = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    if (this._unsubRoom) { this._unsubRoom(); this._unsubRoom = null; }
    if (this._mobileControls) { this._mobileControls.destroy(); this._mobileControls = null; }
    if (this._cancelHostPresence) { this._cancelHostPresence = null; }
  }
}
