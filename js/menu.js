// ============================================================
//  PAPAP DOL — Main Menu + Background Animation + Modals
// ============================================================
import { appState, showScreen } from './main.js';
import { SCREEN }               from './utils/constants.js';
import {
  startMenuMusic, stopMenuMusic,
  setMusicVolume, setSfxVolume, setMasterVolume,
} from './game/Audio.js';

// ── Background Canvas Animation ───────────────────────────────
const bgCanvas = document.getElementById('bg-canvas');
const bgCtx    = bgCanvas.getContext('2d');
let bgParticles = [];
let bgAnimId    = null;

function resizeBg() {
  bgCanvas.width  = window.innerWidth;
  bgCanvas.height = window.innerHeight;
}

function spawnParticle() {
  const types = ['💣', '💥', '✨', '🔥', '⚡'];
  return {
    x    : Math.random() * bgCanvas.width,
    y    : bgCanvas.height + 30,
    vx   : (Math.random() - 0.5) * 1.2,
    vy   : -(1 + Math.random() * 2),
    size : 16 + Math.random() * 24,
    alpha: 0.6 + Math.random() * 0.4,
    char : types[Math.floor(Math.random() * types.length)],
    life : 1,
    decay: 0.003 + Math.random() * 0.004,
  };
}

function animateBg() {
  bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);

  // Spawn new particles
  if (bgParticles.length < 25 && Math.random() < 0.08) {
    bgParticles.push(spawnParticle());
  }

  bgParticles = bgParticles.filter(p => p.life > 0);
  for (const p of bgParticles) {
    p.x += p.vx;
    p.y += p.vy;
    p.life -= p.decay;
    bgCtx.save();
    bgCtx.globalAlpha = p.life * p.alpha;
    bgCtx.font = `${p.size}px serif`;
    bgCtx.fillText(p.char, p.x, p.y);
    bgCtx.restore();
  }

  bgAnimId = requestAnimationFrame(animateBg);
}

function startBg() {
  resizeBg();
  bgCanvas.classList.add('visible');
  if (!bgAnimId) animateBg();
}

function stopBg() {
  bgCanvas.classList.remove('visible');
  if (bgAnimId) { cancelAnimationFrame(bgAnimId); bgAnimId = null; }
  bgParticles = [];
}

// ── Menu Navigation ───────────────────────────────────────────
export function initMenu() {
  window.addEventListener('resize', resizeBg);

  // Main menu buttons
  document.getElementById('btn-menu-play').addEventListener('click', () => {
    showScreen(SCREEN.PLAY);
  });
  document.getElementById('btn-menu-settings').addEventListener('click', () => {
    openModal('settings-modal');
  });
  document.getElementById('btn-menu-howto').addEventListener('click', () => {
    openModal('howto-modal');
  });
  document.getElementById('btn-menu-credits').addEventListener('click', () => {
    openModal('credits-modal');
  });

  // Play screen back
  document.getElementById('btn-play-back').addEventListener('click', () => {
    showScreen(SCREEN.MENU);
  });

  // Modal close buttons
  document.getElementById('btn-settings-close').addEventListener('click', () => closeModal('settings-modal'));
  document.getElementById('btn-howto-close').addEventListener('click', () => closeModal('howto-modal'));
  document.getElementById('btn-credits-close').addEventListener('click', () => closeModal('credits-modal'));

  // Close on backdrop click
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
  });

  // Force update button
  document.getElementById('btn-force-update')?.addEventListener('click', () => {
    if (confirm('Clear cache and force a hard update reload?')) {
      localStorage.clear();
      sessionStorage.clear();
      if ('caches' in window) {
        caches.keys().then(keys => {
          keys.forEach(key => caches.delete(key));
        });
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          registrations.forEach(r => r.unregister());
        });
      }
      const url = new URL(window.location.href);
      url.searchParams.set('update', Date.now().toString());
      window.location.replace(url.toString());
    }
  });

  // Settings controls
  document.getElementById('setting-music').addEventListener('input', e => {
    setMusicVolume(+e.target.value);
    saveSettings();
  });
  document.getElementById('setting-sfx').addEventListener('input', e => {
    setSfxVolume(+e.target.value);
    saveSettings();
  });
  document.getElementById('setting-mute').addEventListener('change', e => {
    setMasterVolume(e.target.checked ? 0 : 1);
    saveSettings();
  });

  // Load saved settings
  loadSettings();

  // Observe screen changes to start/stop bg animation and music
  const menuScreen = document.getElementById(SCREEN.MENU);
  const observer = new MutationObserver(() => {
    if (!menuScreen.classList.contains('hidden')) {
      document.getElementById('menu-nickname-display').textContent = appState.nickname || '???';
      startBg();
      startMenuMusic();
    } else {
      // Only stop bg/music when leaving menu entirely
      const isOnMenu = !menuScreen.classList.contains('hidden');
      if (!isOnMenu) {
        stopBg();
        stopMenuMusic();
      }
    }
  });
  observer.observe(menuScreen, { attributes: true, attributeFilter: ['class'] });
}

// ── Modals ─────────────────────────────────────────────────────
export function openModal(id) {
  document.getElementById(id).classList.add('open');
}

export function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// ── Settings Persistence ──────────────────────────────────────
function saveSettings() {
  localStorage.setItem('papap_settings', JSON.stringify({
    music: document.getElementById('setting-music').value,
    sfx  : document.getElementById('setting-sfx').value,
    mute : document.getElementById('setting-mute').checked,
  }));
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('papap_settings') || '{}');
    if (s.music !== undefined) {
      document.getElementById('setting-music').value = s.music;
      setMusicVolume(+s.music);
    }
    if (s.sfx !== undefined) {
      document.getElementById('setting-sfx').value = s.sfx;
      setSfxVolume(+s.sfx);
    }
    if (s.mute) {
      document.getElementById('setting-mute').checked = true;
      setMasterVolume(0);
    }
  } catch { /* ignore */ }
}
