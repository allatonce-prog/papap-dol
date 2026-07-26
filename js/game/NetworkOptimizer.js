// ============================================================
//  PAPAP DOL — High-Performance Network Optimizer & Interpolation
//  Provides zero-lag player movement interpolation, dead-reckoning,
//  delta quantization, and adaptive update throttling for Firebase.
// ============================================================

/**
 // Snapshot Buffer for smooth remote player position rendering
 */
export class SnapshotBuffer {
  constructor(maxSize = 10, renderDelayMs = 45) {
    this.buffer = [];
    this.maxSize = maxSize;
    this.renderDelayMs = renderDelayMs; // Lag compensation delay window
  }

  push(snapshot) {
    // snapshot: { timestamp: number, px: number, py: number, vx: number, vy: number, direction: string }
    const time = snapshot.timestamp || Date.now();
    this.buffer.push({ ...snapshot, timestamp: time });

    // Maintain maximum buffer size
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  /**
   * Sample interpolated state at current time minus renderDelayMs
   */
  sample(now = Date.now()) {
    if (this.buffer.length === 0) return null;
    if (this.buffer.length === 1) {
      const snap = this.buffer[0];
      return { px: snap.px, py: snap.py, vx: snap.vx || 0, vy: snap.vy || 0, direction: snap.direction };
    }

    const renderTime = now - this.renderDelayMs;

    // If renderTime is older than first snapshot, return oldest
    if (renderTime <= this.buffer[0].timestamp) {
      const snap = this.buffer[0];
      return { px: snap.px, py: snap.py, vx: snap.vx || 0, vy: snap.vy || 0, direction: snap.direction };
    }

    // If renderTime is newer than latest snapshot, perform Dead Reckoning Extrapolation
    const newest = this.buffer[this.buffer.length - 1];
    if (renderTime >= newest.timestamp) {
      const deltaSec = Math.min(0.15, (renderTime - newest.timestamp) / 1000);
      const extPx = newest.px + (newest.vx || 0) * deltaSec;
      const extPy = newest.py + (newest.vy || 0) * deltaSec;
      return { px: extPx, py: extPy, vx: newest.vx || 0, vy: newest.vy || 0, direction: newest.direction };
    }

    // Find bounding snapshots for Hermite / Linear interpolation
    for (let i = 0; i < this.buffer.length - 1; i++) {
      const s0 = this.buffer[i];
      const s1 = this.buffer[i + 1];

      if (renderTime >= s0.timestamp && renderTime <= s1.timestamp) {
        const span = s1.timestamp - s0.timestamp;
        const t = span > 0 ? (renderTime - s0.timestamp) / span : 0;

        // Smooth Cubic Hermite interpolation
        const t2 = t * t;
        const t3 = t2 * t;
        const h1 = 2 * t3 - 3 * t2 + 1;
        const h2 = -2 * t3 + 3 * t2;

        const interpPx = s0.px * h1 + s1.px * h2;
        const interpPy = s0.py * h1 + s1.py * h2;

        const interpVx = (s0.vx || 0) * (1 - t) + (s1.vx || 0) * t;
        const interpVy = (s0.vy || 0) * (1 - t) + (s1.vy || 0) * t;

        return {
          px: interpPx,
          py: interpPy,
          vx: interpVx,
          vy: interpVy,
          direction: t > 0.5 ? s1.direction : s0.direction
        };
      }
    }

    return this.buffer[this.buffer.length - 1];
  }

  clear() {
    this.buffer = [];
  }
}

/**
 * Quantizes and compresses local updates before sending to Firebase
 */
export class DeltaCompressor {
  constructor(tolerancePx = 0.5) {
    this.tolerancePx = tolerancePx;
    this.lastSentState = null;
  }

  /**
   * Checks if state has changed significantly enough to broadcast
   */
  shouldSend(currentState) {
    if (!this.lastSentState) return true;

    const dx = Math.abs(currentState.px - this.lastSentState.px);
    const dy = Math.abs(currentState.py - this.lastSentState.py);
    const dirChanged = currentState.direction !== this.lastSentState.direction;
    const aliveChanged = currentState.alive !== this.lastSentState.alive;
    const statsChanged =
      currentState.speed !== this.lastSentState.speed ||
      currentState.hp !== this.lastSentState.hp ||
      currentState.shield !== this.lastSentState.shield;

    return dx >= this.tolerancePx || dy >= this.tolerancePx || dirChanged || aliveChanged || statsChanged;
  }

  /**
   * Quantizes position to 1 decimal place to save packet size & DB overhead
   */
  createCompressedPayload(currentState) {
    const payload = {
      px: Math.round(currentState.px * 10) / 10,
      py: Math.round(currentState.py * 10) / 10,
      vx: Math.round((currentState.vx || 0) * 10) / 10,
      vy: Math.round((currentState.vy || 0) * 10) / 10,
      direction: currentState.direction,
      ts: Date.now()
    };

    if (currentState.alive !== undefined) payload.alive = currentState.alive;
    if (currentState.hp !== undefined) payload.hp = currentState.hp;
    if (currentState.speed !== undefined) payload.speed = currentState.speed;
    if (currentState.shield !== undefined) payload.shield = currentState.shield;

    this.lastSentState = { ...currentState, ...payload };
    return payload;
  }
}

/**
 * Network Update Controller for local player network dispatching
 */
export class NetworkController {
  constructor(updateRateHz = 30) {
    this.intervalMs = 1000 / updateRateHz;
    this.lastSendTime = 0;
    this.compressor = new DeltaCompressor();
  }

  processLocalUpdate(playerState, sendCallback) {
    const now = Date.now();
    const elapsed = now - this.lastSendTime;

    if (elapsed >= this.intervalMs) {
      if (this.compressor.shouldSend(playerState)) {
        const payload = this.compressor.createCompressedPayload(playerState);
        sendCallback(payload);
        this.lastSendTime = now;
      }
    }
  }
}
