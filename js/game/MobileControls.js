// ============================================================
//  PAPAP DOL — Mobile Controls
//  Virtual joystick + bomb button for touch devices.
//  Injects into the shared KEYS map used by Player.js.
// ============================================================

export class MobileControls {
  /**
   * @param {object} KEYS  The shared key-state map from Player.js
   */
  constructor(KEYS) {
    this.KEYS = KEYS;
    this._el  = null;
    this._joystickBase  = null;
    this._joystickKnob  = null;
    this._bombBtn       = null;
    this._detonateBtn   = null;

    // Joystick state
    this._joyActive  = false;
    this._joyTouchId = null;
    this._joyOrigin  = { x: 0, y: 0 };

    this._create();
    this._bind();
  }

  // ── Build DOM ─────────────────────────────────────────────
  _create() {
    const el = document.createElement('div');
    el.id = 'mobile-controls';
    el.innerHTML = `
      <div id="joy-zone">
        <div id="joy-base">
          <div id="joy-knob"></div>
        </div>
      </div>
      <div id="action-zone">
        <button id="btn-mobile-detonate" aria-label="Remote Detonate">⏰</button>
        <button id="btn-mobile-bomb" aria-label="Place Bomb">💣</button>
      </div>
    `;
    document.body.appendChild(el);

    this._el            = el;
    this._joystickBase  = el.querySelector('#joy-base');
    this._joystickKnob  = el.querySelector('#joy-knob');
    this._bombBtn       = el.querySelector('#btn-mobile-bomb');
    this._detonateBtn   = el.querySelector('#btn-mobile-detonate');
  }

  // ── Events ────────────────────────────────────────────────
  _bind() {
    // Joystick touch
    const zone = this._el.querySelector('#joy-zone');
    zone.addEventListener('touchstart',  e => this._joyStart(e),  { passive: false });
    zone.addEventListener('touchmove',   e => this._joyMove(e),   { passive: false });
    zone.addEventListener('touchend',    e => this._joyEnd(e),    { passive: false });
    zone.addEventListener('touchcancel', e => this._joyEnd(e),    { passive: false });

    // Bomb button
    this._bombBtn.addEventListener('touchstart', e => {
      e.preventDefault();
      this.KEYS['Space'] = true;
    }, { passive: false });
    this._bombBtn.addEventListener('touchend', e => {
      e.preventDefault();
      // KEYS['Space'] is consumed by Player._tryPlaceBomb → no need to clear here
    }, { passive: false });

    // Detonate button (Shift)
    this._detonateBtn.addEventListener('touchstart', e => {
      e.preventDefault();
      this.KEYS['ShiftLeft'] = true;
    }, { passive: false });
    this._detonateBtn.addEventListener('touchend', e => {
      e.preventDefault();
    }, { passive: false });
  }

  _joyStart(e) {
    e.preventDefault();
    if (this._joyActive) return;
    const touch = e.changedTouches[0];
    this._joyActive  = true;
    this._joyTouchId = touch.identifier;

    const rect = this._joystickBase.getBoundingClientRect();
    this._joyOrigin = {
      x: rect.left + rect.width  / 2,
      y: rect.top  + rect.height / 2,
    };
    this._updateJoy(touch.clientX, touch.clientY);
  }

  _joyMove(e) {
    e.preventDefault();
    if (!this._joyActive) return;
    for (const t of e.changedTouches) {
      if (t.identifier === this._joyTouchId) {
        this._updateJoy(t.clientX, t.clientY);
        break;
      }
    }
  }

  _joyEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this._joyTouchId) {
        this._joyActive  = false;
        this._joyTouchId = null;
        this._resetJoy();
        break;
      }
    }
  }

  _updateJoy(cx, cy) {
    const dx   = cx - this._joyOrigin.x;
    const dy   = cy - this._joyOrigin.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const MAX  = 36; // max knob travel px
    const norm = Math.min(dist, MAX);
    const angle= Math.atan2(dy, dx);

    // Move knob visually
    const kx = Math.cos(angle) * norm;
    const ky = Math.sin(angle) * norm;
    this._joystickKnob.style.transform = `translate(${kx}px, ${ky}px)`;

    // Threshold before registering direction
    const DEAD = 14;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Clear all directional keys first
    this.KEYS['ArrowUp']    = false;
    this.KEYS['ArrowDown']  = false;
    this.KEYS['ArrowLeft']  = false;
    this.KEYS['ArrowRight'] = false;

    if (dist > DEAD) {
      // 4-directional: pick dominant axis
      if (absDx >= absDy) {
        if (dx > 0) this.KEYS['ArrowRight'] = true;
        else        this.KEYS['ArrowLeft']  = true;
      } else {
        if (dy > 0) this.KEYS['ArrowDown']  = true;
        else        this.KEYS['ArrowUp']    = true;
      }
    }
  }

  _resetJoy() {
    this._joystickKnob.style.transform = 'translate(0px, 0px)';
    this.KEYS['ArrowUp']    = false;
    this.KEYS['ArrowDown']  = false;
    this.KEYS['ArrowLeft']  = false;
    this.KEYS['ArrowRight'] = false;
  }

  // ── Show / Hide ───────────────────────────────────────────
  show() { this._el.style.display = 'flex'; }
  hide() { this._el.style.display = 'none'; }

  destroy() {
    this._resetJoy();
    this._el?.remove();
    this._el = null;
  }
}
