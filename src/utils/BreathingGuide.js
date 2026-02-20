/**
 * BreathingGuide
 * Manages the on-screen breathing animation and phase sequencing
 * Patterns: Box (4-4-4-4), 4-7-8, Calm (6-2-6)
 */

export class BreathingGuide {
  constructor() {
    this.active     = false;
    this.pattern    = '4-4-4-4';
    this.phase      = 0;
    this.phaseTime  = 0;
    this.startTime  = 0;
    this.animFrame  = null;

    // DOM refs
    this.overlay    = document.getElementById('breathingOverlay');
    this.ring       = document.getElementById('breathingRing');
    this.circle     = document.getElementById('breathingCircle');
    this.textEl     = document.getElementById('breathingText');
    this.countEl    = document.getElementById('breathingCount');
    this.phaseEl    = document.getElementById('breathePhase');

    this.PATTERNS = {
      '4-4-4-4': [
        { name: 'INHALE',  secs: 4, scale: 1.3, color: '#00e5ff' },
        { name: 'HOLD',    secs: 4, scale: 1.3, color: '#00ff99' },
        { name: 'EXHALE',  secs: 4, scale: 0.8, color: '#ffaa00' },
        { name: 'HOLD',    secs: 4, scale: 0.8, color: '#bf5fff' },
      ],
      '4-7-8': [
        { name: 'INHALE',  secs: 4, scale: 1.3, color: '#00e5ff' },
        { name: 'HOLD',    secs: 7, scale: 1.3, color: '#00ff99' },
        { name: 'EXHALE',  secs: 8, scale: 0.7, color: '#ffaa00' },
      ],
      '6-2-6': [
        { name: 'INHALE',  secs: 6, scale: 1.3, color: '#00e5ff' },
        { name: 'HOLD',    secs: 2, scale: 1.3, color: '#00ff99' },
        { name: 'EXHALE',  secs: 6, scale: 0.7, color: '#ffaa00' },
      ],
    };

    this.CIRCUMFERENCE = 2 * Math.PI * 50; // r=50
    this.circle.style.strokeDasharray  = this.CIRCUMFERENCE;
    this.circle.style.strokeDashoffset = this.CIRCUMFERENCE;
  }

  setPattern(pattern) {
    this.pattern = pattern;
    if (this.active) {
      this.phase = 0;
      this.startTime = performance.now();
    }
  }

  start() {
    if (this.active) return;
    this.active    = true;
    this.phase     = 0;
    this.startTime = performance.now();
    this.overlay.style.display = 'flex';
    this._tick();
  }

  stop() {
    this.active = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.overlay.style.display = 'none';
    if (this.phaseEl) this.phaseEl.textContent = '—';
  }

  _tick() {
    if (!this.active) return;
    const phases     = this.PATTERNS[this.pattern];
    const curPhase   = phases[this.phase % phases.length];
    const elapsed    = (performance.now() - this.startTime) / 1000;
    const remaining  = curPhase.secs - elapsed;

    if (remaining <= 0) {
      this.phase++;
      this.startTime = performance.now();
      this.animFrame = requestAnimationFrame(() => this._tick());
      return;
    }

    // Update progress
    const progress = elapsed / curPhase.secs;
    const offset   = this.CIRCUMFERENCE * (1 - progress);
    this.circle.style.strokeDashoffset = offset;
    this.circle.style.stroke = curPhase.color;

    // Scale ring
    const scale = 1 + (curPhase.scale - 1) * progress;
    this.ring.style.transform = `scale(${scale.toFixed(3)})`;

    // Update text
    this.textEl.textContent  = curPhase.name;
    this.textEl.style.color  = curPhase.color;
    this.countEl.textContent = Math.ceil(remaining);
    this.countEl.style.color = curPhase.color;

    // Update phase panel label
    if (this.phaseEl) this.phaseEl.textContent = curPhase.name;

    this.animFrame = requestAnimationFrame(() => this._tick());
  }

  toggle(force) {
    if (force !== undefined) {
      force ? this.start() : this.stop();
    } else {
      this.active ? this.stop() : this.start();
    }
  }
}
