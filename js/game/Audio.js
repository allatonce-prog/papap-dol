// ============================================================
//  PAPAP DOL — Synthesized Audio Engine
//  All sounds generated with Web Audio API. No files required.
// ============================================================

let _ctx = null;
let _masterGain = null;
let _musicGain  = null;
let _sfxGain    = null;
let _musicOsc   = null;
let _musicInterval = null;

function resumeCtx() {
  if (!_ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    _ctx = new AudioCtx();
    _masterGain = _ctx.createGain();
    _masterGain.gain.value = 0.7;
    _masterGain.connect(_ctx.destination);

    _musicGain = _ctx.createGain();
    _musicGain.gain.value = 0.25;
    _musicGain.connect(_masterGain);

    _sfxGain = _ctx.createGain();
    _sfxGain.gain.value = 0.6;
    _sfxGain.connect(_masterGain);
  }
  if (_ctx && _ctx.state === 'suspended') {
    _ctx.resume().catch(() => {});
  }
  return _ctx;
}

// ── Helpers ───────────────────────────────────────────────────
function playTone(freq, type, startTime, duration, gainVal = 0.4, targetGain = null, dest = null) {
  const ctx = resumeCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(gainVal, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(dest || _sfxGain);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
  return osc;
}

function playNoise(startTime, duration, gainVal = 0.3) {
  const ctx = resumeCtx();
  const bufLen = ctx.sampleRate * duration;
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src  = ctx.createBufferSource();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 300;
  filter.Q.value = 0.5;
  src.buffer = buf;
  gain.gain.setValueAtTime(gainVal, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(_sfxGain);
  src.start(startTime);
  src.stop(startTime + duration + 0.05);
}

// ── Sound Effects ─────────────────────────────────────────────

export function sfxBombPlace() {
  const ctx = resumeCtx();
  const t = ctx.currentTime;
  playTone(220, 'square', t, 0.08, 0.3);
  playTone(180, 'square', t + 0.06, 0.1, 0.2);
}

export function sfxExplosion() {
  const ctx = resumeCtx();
  const t = ctx.currentTime;
  playNoise(t, 0.6, 0.8);
  playTone(60, 'sawtooth', t, 0.4, 0.5);
  playTone(40, 'sine', t + 0.1, 0.5, 0.4);
}

export function sfxPowerUp() {
  const ctx = resumeCtx();
  const t = ctx.currentTime;
  [392, 523, 659, 784].forEach((f, i) => playTone(f, 'sine', t + i * 0.07, 0.12, 0.35));
}

export function sfxDeath() {
  const ctx = resumeCtx();
  const t = ctx.currentTime;
  [440, 392, 349, 294, 220].forEach((f, i) => playTone(f, 'square', t + i * 0.08, 0.15, 0.3));
}

export function sfxCountdownBeep(isFinal) {
  const ctx = resumeCtx();
  const t = ctx.currentTime;
  playTone(isFinal ? 880 : 660, 'sine', t, 0.18, 0.5);
}

export function sfxVictory() {
  const ctx = resumeCtx();
  const t = ctx.currentTime;
  const melody = [523, 523, 523, 659, 784, 659, 784];
  melody.forEach((f, i) => playTone(f, 'square', t + i * 0.12, 0.18, 0.4));
}

export function sfxJoin() {
  const ctx = resumeCtx();
  const t = ctx.currentTime;
  playTone(440, 'sine', t, 0.1, 0.3);
  playTone(550, 'sine', t + 0.1, 0.1, 0.3);
}

// ── Menu Music ────────────────────────────────────────────────
const MELODY = [
  523,523,659,784,659,523,392,440,
  494,523,659,784,880,784,659,523,
];
let _melodyIdx = 0;
let _melodyTimer = null;

export function startMenuMusic() {
  stopMenuMusic();
  const ctx = resumeCtx();
  function playNext() {
    const freq = MELODY[_melodyIdx % MELODY.length];
    _melodyIdx++;
    const t = ctx.currentTime;
    // Bass
    playTone(freq / 2, 'square', t, 0.14, 0.12, null, _musicGain);
    // Lead
    playTone(freq, 'sine', t, 0.12, 0.15, null, _musicGain);
    _melodyTimer = setTimeout(playNext, 140);
  }
  playNext();
}

export function stopMenuMusic() {
  if (_melodyTimer) clearTimeout(_melodyTimer);
  _melodyTimer = null;
}

// ── Volume Controls ───────────────────────────────────────────
export function setMusicVolume(v) {
  if (_musicGain) _musicGain.gain.value = v * 0.3;
}

export function setSfxVolume(v) {
  if (_sfxGain) _sfxGain.gain.value = v * 0.8;
}

export function setMasterVolume(v) {
  if (_masterGain) _masterGain.gain.value = v;
}

// Unlock audio on first user interaction (required by browsers)
export function unlockAudio() {
  resumeCtx();
}
