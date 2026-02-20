/**
 * AudioAlert
 * Web Audio API-based stress alert sounds — no external files needed.
 * Tones: beep, pulse, chime
 */

export class AudioAlert {
  constructor() {
    this.ctx          = null;
    this.enabled      = true;
    this.tone         = 'beep';
    this.lastAlert    = 0;
    this.COOLDOWN     = 8000; // ms between alerts
  }

  _getCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.ctx;
  }

  setEnabled(v) { this.enabled = v; }
  setTone(t)    { this.tone = t; }

  /** Play if enabled and cooldown passed */
  maybeAlert(stressLevel) {
    if (!this.enabled) return;
    const now = Date.now();
    if (now - this.lastAlert < this.COOLDOWN) return;
    this.lastAlert = now;
    this.play(this.tone, stressLevel);
  }

  play(tone = this.tone, stress = 80) {
    try {
      const ctx = this._getCtx();
      if (ctx.state === 'suspended') ctx.resume();
      switch (tone) {
        case 'beep':  this._beep(ctx, stress); break;
        case 'pulse': this._pulse(ctx, stress); break;
        case 'chime': this._chime(ctx, stress); break;
        default:      this._beep(ctx, stress);
      }
    } catch (e) {
      console.warn('AudioAlert error:', e);
    }
  }

  _beep(ctx, stress) {
    const freq = 440 + (stress - 40) * 4; // higher stress = higher pitch
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type      = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  }

  _pulse(ctx, stress) {
    const times = stress > 80 ? 3 : 2;
    for (let i = 0; i < times; i++) {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.value = 280 + i * 80;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.25, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.start(t);
      osc.stop(t + 0.15);
    }
  }

  _chime(ctx, stress) {
    const notes = [523, 659, 784]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  }
}
