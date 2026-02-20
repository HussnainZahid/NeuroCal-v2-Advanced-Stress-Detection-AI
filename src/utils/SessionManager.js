/**
 * SessionManager
 * Records stress data during active sessions.
 * Persists to localStorage. Exports CSV/JSON.
 */

export class SessionManager {
  constructor() {
    this.STORAGE_KEY    = 'neurocal_sessions';
    this.currentSession = null;
    this.sessions       = this._load();
  }

  /** Start a new recording session */
  startSession() {
    this.currentSession = {
      id:         Date.now(),
      startTime:  new Date().toISOString(),
      endTime:    null,
      duration:   0,
      frames:     [],       // { t, stress, emotion, pitch, yaw, roll, focus }
      emotionTotals: {},
      peakStress: 0,
      minStress:  100,
      alerts:     0,
    };
  }

  /** Record one frame of data */
  recordFrame(stress, emotion, metrics) {
    if (!this.currentSession) return;
    const frame = {
      t:       Date.now() - this.currentSession.id,
      stress,
      emotion: emotion?.dominant || 'neutral',
      focus:   Math.round((metrics?.focusScore?.normalized || 0) * 100),
      pitch:   metrics?.headPose?.pitch || 0,
      yaw:     metrics?.headPose?.yaw   || 0,
      roll:    metrics?.headPose?.roll  || 0,
      blink:   metrics?.blinkRate?.bpm  || 0,
    };
    this.currentSession.frames.push(frame);
    if (stress > this.currentSession.peakStress) this.currentSession.peakStress = stress;
    if (stress < this.currentSession.minStress)  this.currentSession.minStress  = stress;

    // Tally emotions
    const e = frame.emotion;
    this.currentSession.emotionTotals[e] = (this.currentSession.emotionTotals[e] || 0) + 1;
  }

  recordAlert() {
    if (this.currentSession) this.currentSession.alerts++;
  }

  /** Finalize and save session */
  endSession(analyzerStats) {
    if (!this.currentSession) return null;
    const now = new Date();
    this.currentSession.endTime  = now.toISOString();
    this.currentSession.duration = Date.now() - this.currentSession.id;

    if (analyzerStats) {
      this.currentSession.avgStress = analyzerStats.avg;
    } else {
      const scores = this.currentSession.frames.map(f => f.stress);
      this.currentSession.avgStress = scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    }

    // Dominant emotion
    const totals = this.currentSession.emotionTotals;
    this.currentSession.dominantEmotion = Object.keys(totals).length
      ? Object.keys(totals).reduce((a, b) => totals[a] > totals[b] ? a : b)
      : 'neutral';

    this.sessions.unshift(this.currentSession);
    if (this.sessions.length > 20) this.sessions.pop(); // keep last 20
    this._save();
    const completed = this.currentSession;
    this.currentSession = null;
    return completed;
  }

  getSessions() { return this.sessions; }

  deleteSession(id) {
    this.sessions = this.sessions.filter(s => s.id !== id);
    this._save();
  }

  clearAll() {
    this.sessions = [];
    this._save();
  }

  /** Export current or all sessions as CSV */
  exportCSV(sessionId) {
    const session = sessionId
      ? this.sessions.find(s => s.id === sessionId)
      : this.sessions[0];
    if (!session) return;

    const rows = [
      ['time_ms', 'stress', 'emotion', 'focus', 'pitch', 'yaw', 'roll', 'blink_rate'].join(','),
      ...session.frames.map(f =>
        [f.t, f.stress, f.emotion, f.focus, f.pitch, f.yaw, f.roll, f.blink].join(',')
      )
    ];
    this._download(rows.join('\n'), `neurocal_session_${session.id}.csv`, 'text/csv');
  }

  /** Export all sessions as JSON */
  exportJSON() {
    const data = this.sessions.map(s => ({
      id:             s.id,
      startTime:      s.startTime,
      endTime:        s.endTime,
      durationSec:    Math.round(s.duration / 1000),
      avgStress:      s.avgStress,
      peakStress:     s.peakStress,
      minStress:      s.minStress,
      alerts:         s.alerts,
      dominantEmotion: s.dominantEmotion,
      emotionTotals:  s.emotionTotals,
      frameCount:     s.frames.length,
    }));
    this._download(JSON.stringify(data, null, 2), 'neurocal_sessions.json', 'application/json');
  }

  _download(content, filename, type) {
    const blob = new Blob([content], { type });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  _save()   { try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.sessions)); } catch(e){} }
  _load()   { try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || []; } catch(e){ return []; } }
}
