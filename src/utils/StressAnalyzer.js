/**
 * StressAnalyzer v2
 * 8-channel biometric stress computation from 68 facial landmarks
 * Channels: eye openness, brow tension, mouth tension, facial asymmetry,
 *           head movement, blink rate, focus score, head pose
 */
export class StressAnalyzer {
  constructor() {
    this.history     = [];
    this.MAX_HISTORY = 120; // 2 minutes at 0.5Hz effective
    this.blinkCount  = 0;
    this.blinkWindowStart = Date.now();
    this.EAR_THRESHOLD    = 0.21;
    this.eyeWasClosed     = false;
    this.prevNose         = null;
    this.headMovBuf       = [];
    this.MAX_MOV_BUF      = 12;
    this.blinkTimestamps  = [];
    this.frameCount       = 0;
    this.prevPose         = { pitch: 0, yaw: 0, roll: 0 };
    // Running stats for session
    this.sessionScores    = [];
    this.totalFrames      = 0;
  }

  /**
   * @param {faceapi.FaceLandmarks68} landmarks
   * @param {object} box  — {x,y,width,height}
   * @returns {AnalysisResult}
   */
  analyze(landmarks, box) {
    const pts      = landmarks.positions;
    const faceSize = box.width || 200;
    this.frameCount++;
    this.totalFrames++;

    const eyeOpenness  = this._eyeOpenness(pts, faceSize);
    const browTension  = this._browTension(pts, faceSize);
    const mouthTension = this._mouthTension(pts, faceSize);
    const asymmetry    = this._asymmetry(pts, faceSize);
    const headMovement = this._headMovement(pts, faceSize);
    const blinkRate    = this._blinkRate(eyeOpenness.ear);
    const focusScore   = this._focusScore(eyeOpenness, browTension, headMovement);
    const headPose     = this._headPose(pts, faceSize);

    // Weighted stress composite
    const raw =
      (1 - eyeOpenness.normalized)  * 20 +
      browTension.normalized         * 25 +
      mouthTension.normalized        * 18 +
      asymmetry.normalized           * 12 +
      headMovement.normalized        * 10 +
      blinkRate.normalized           * 10 +
      (1 - focusScore.normalized)    * 5;

    const stress = Math.min(100, Math.max(0, Math.round(raw)));
    this.history.push(stress);
    if (this.history.length > this.MAX_HISTORY) this.history.shift();
    this.sessionScores.push(stress);

    return {
      stress,
      level: this._level(stress),
      metrics: { eyeOpenness, browTension, mouthTension, asymmetry, headMovement, blinkRate, focusScore, headPose },
      history: this.history,
    };
  }

  /* ── SIGNAL METHODS ── */

  _eyeOpenness(pts, faceSize) {
    const earL = this._ear(pts, 36, 37, 38, 39, 40, 41);
    const earR = this._ear(pts, 42, 43, 44, 45, 46, 47);
    const ear  = (earL + earR) / 2;
    const normalized = Math.min(1, Math.max(0, (ear - 0.1) / 0.3));
    return { ear, normalized, earL, earR, label: `${(normalized * 100).toFixed(0)}%` };
  }

  _ear(pts, p1, p2, p3, p4, p5, p6) {
    const A = this._dist(pts[p2], pts[p6]);
    const B = this._dist(pts[p3], pts[p5]);
    const C = this._dist(pts[p1], pts[p4]);
    return (A + B) / (2.0 * C);
  }

  _browTension(pts, faceSize) {
    const lBrowY = (pts[18].y + pts[19].y + pts[20].y) / 3;
    const rBrowY = (pts[23].y + pts[24].y + pts[25].y) / 3;
    const lEyeY  = (pts[37].y + pts[38].y + pts[40].y + pts[41].y) / 4;
    const rEyeY  = (pts[43].y + pts[44].y + pts[46].y + pts[47].y) / 4;
    const gap    = ((lEyeY - lBrowY) + (rEyeY - rBrowY)) / 2;
    const normalized = Math.min(1, Math.max(0, 1 - gap / (0.18 * faceSize)));
    return { gap, normalized, label: `${(normalized * 100).toFixed(0)}%` };
  }

  _mouthTension(pts, faceSize) {
    const mW = this._dist(pts[48], pts[54]);
    const mH = this._dist(pts[51], pts[57]);
    const ratio = mH / (mW + 0.001);
    const normalized = Math.min(1, Math.max(0, 1 - ratio / 0.3));
    return { ratio, normalized, label: `${(normalized * 100).toFixed(0)}%` };
  }

  _asymmetry(pts, faceSize) {
    const nose  = pts[30];
    const lEyeX = (pts[36].x + pts[39].x) / 2;
    const rEyeX = (pts[42].x + pts[45].x) / 2;
    const eyeDiff   = Math.abs((nose.x - lEyeX) - (rEyeX - nose.x));
    const mouthDiff = Math.abs((nose.x - pts[48].x) - (pts[54].x - nose.x));
    const asym  = (eyeDiff + mouthDiff) / 2;
    const normalized = Math.min(1, asym / (0.05 * faceSize));
    return { value: asym, normalized, label: `${((1 - normalized) * 100).toFixed(0)}%` };
  }

  _headMovement(pts, faceSize) {
    const c = pts[30];
    if (this.prevNose) {
      const dx  = c.x - this.prevNose.x;
      const dy  = c.y - this.prevNose.y;
      const mov = Math.sqrt(dx * dx + dy * dy) / faceSize;
      this.headMovBuf.push(mov);
      if (this.headMovBuf.length > this.MAX_MOV_BUF) this.headMovBuf.shift();
    }
    this.prevNose = { x: c.x, y: c.y };
    const avg = this.headMovBuf.length > 0
      ? this.headMovBuf.reduce((a, b) => a + b, 0) / this.headMovBuf.length : 0;
    const normalized = Math.min(1, avg / 0.05);
    return { value: avg, normalized, label: `${(normalized * 100).toFixed(0)}%` };
  }

  _blinkRate(ear) {
    const now = Date.now();
    if (ear < this.EAR_THRESHOLD && !this.eyeWasClosed) {
      this.eyeWasClosed = true;
    } else if (ear >= this.EAR_THRESHOLD && this.eyeWasClosed) {
      this.eyeWasClosed = false;
      this.blinkTimestamps.push(now);
    }
    // Rolling 60s window
    this.blinkTimestamps = this.blinkTimestamps.filter(t => now - t < 60000);
    const bpm = this.blinkTimestamps.length; // blinks in last 60s ≈ per minute
    let normalized;
    if (bpm < 8)       normalized = (8 - bpm) / 8;
    else if (bpm > 25) normalized = Math.min(1, (bpm - 25) / 20);
    else               normalized = 0;
    return { bpm, normalized, label: `${bpm}/min` };
  }

  _focusScore(eyeOpenness, browTension, headMovement) {
    // High focus = eyes open, brows relaxed, head steady
    const raw = eyeOpenness.normalized * 0.5
              + (1 - browTension.normalized) * 0.3
              + (1 - headMovement.normalized) * 0.2;
    const normalized = Math.min(1, Math.max(0, raw));
    return { normalized, label: `${(normalized * 100).toFixed(0)}%` };
  }

  /** Approximate head pose from landmark geometry (no 3D model needed) */
  _headPose(pts, faceSize) {
    // Pitch: nose tip vs mid-eyes vertical offset
    const eyeMidY  = (pts[36].y + pts[45].y) / 2;
    const noseTip  = pts[30];
    const mouthMid = (pts[48].y + pts[54].y) / 2;
    const faceH    = mouthMid - eyeMidY;
    const pitchRaw = ((noseTip.y - eyeMidY) / (faceH + 0.001) - 0.45) * 2;
    const pitch    = Math.round(pitchRaw * 35);

    // Yaw: nose to eye horizontal offset asymmetry
    const lEyeX = (pts[36].x + pts[39].x) / 2;
    const rEyeX = (pts[42].x + pts[45].x) / 2;
    const eyeW  = rEyeX - lEyeX;
    const yawRaw = (noseTip.x - lEyeX) / (eyeW + 0.001) - 0.5;
    const yaw   = Math.round(yawRaw * 60);

    // Roll: eye line tilt
    const dy = pts[45].y - pts[36].y;
    const dx = pts[45].x - pts[36].x;
    const roll = Math.round(Math.atan2(dy, dx) * (180 / Math.PI));

    const normalized = Math.min(1, (Math.abs(pitch) + Math.abs(yaw)) / 60);
    this.prevPose = { pitch, yaw, roll };
    return { pitch, yaw, roll, normalized, label: `${yaw > 0 ? 'R' : 'L'}${Math.abs(yaw)}°` };
  }

  /* ── UTILITIES ── */

  _level(score) {
    if (score < 20) return { label: 'CALM',     cls: 'calm',     color: '#00ff99' };
    if (score < 40) return { label: 'MILD',     cls: 'mild',     color: '#00e5ff' };
    if (score < 60) return { label: 'MODERATE', cls: 'moderate', color: '#ffaa00' };
    if (score < 80) return { label: 'HIGH',     cls: 'high',     color: '#ff3b3b' };
    return            { label: 'EXTREME',    cls: 'extreme',  color: '#ff0055' };
  }

  _dist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  getSessionStats() {
    if (!this.sessionScores.length) return null;
    const scores = this.sessionScores;
    const avg  = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const peak = Math.max(...scores);
    const min  = Math.min(...scores);
    const calm = scores.filter(s => s < 20).length;
    const high = scores.filter(s => s >= 60).length;
    return { avg, peak, min, calm, high, total: scores.length };
  }

  reset() {
    this.history     = [];
    this.sessionScores = [];
    this.blinkTimestamps = [];
    this.prevNose    = null;
    this.headMovBuf  = [];
    this.eyeWasClosed = false;
    this.frameCount  = 0;
    this.totalFrames = 0;
  }
}
