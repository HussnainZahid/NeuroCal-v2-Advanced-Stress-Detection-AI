/**
 * NeuroCal v2 — Main Application
 * Orchestrates: face detection, stress analysis, emotion detection,
 * breathing guide, audio alerts, session recording, all UI updates.
 */

import { StressAnalyzer }  from './utils/StressAnalyzer.js';
import { CanvasRenderer }  from './utils/CanvasRenderer.js';
import { BreathingGuide }  from './utils/BreathingGuide.js';
import { AudioAlert }      from './utils/AudioAlert.js';
import { SessionManager }  from './utils/SessionManager.js';

// ──────────────────────────────────────────────
//  Constants & State
// ──────────────────────────────────────────────
const MODEL_URL = './models';
let DETECTION_INPUT_SIZE = 320;
const SCORE_THRESHOLD    = 0.4;

const state = {
  running:        false,
  stream:         null,
  video:          null,
  mirror:         false,
  multiFaceMode:  false,
  lastFrame:      0,
  frameCount:     0,
  fpsTimer:       0,
  currentFPS:     0,
  sessionStart:   null,
  alertCount:     0,
  peakStress:     0,
  minStress:      100,
  allStress:      [],
  alertThreshold: 70,
  breathThreshold:70,
  breathAutoMode: true,
  breathingActive:false,
};

// ──────────────────────────────────────────────
//  Module instances
// ──────────────────────────────────────────────
const analyzer  = new StressAnalyzer();
const renderer  = new CanvasRenderer();
const breathing = new BreathingGuide();
const audio     = new AudioAlert();
const sessions  = new SessionManager();

// ──────────────────────────────────────────────
//  Boot
// ──────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupSettings();
  setupSessionsTab();
  await loadModels();
  setupButtons();
  renderSessionsList();
});

// ──────────────────────────────────────────────
//  Model Loading
// ──────────────────────────────────────────────
async function loadModels() {
  setStatus('loading');
  setEl('modelReady', 'LOADING MODELS...');
  log('Fetching face detection models...', 'sys');

  try {
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    log('TinyFaceDetector ✓', 'ok');
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    log('FaceLandmark68 ✓', 'ok');
    await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
    log('FaceExpression ✓', 'ok');

    setStatus('ready');
    setEl('modelReady', 'READY');
    log('All models loaded — press ACTIVATE CAMERA', 'ok');
  } catch (err) {
    log(`Model load error: ${err.message}`, 'alert');
    log('Run: node setup.js  then serve via HTTP (not file://)', 'warn');
    setEl('modelReady', 'MODEL ERROR');
    setStatus('ready');
  }
}

// ──────────────────────────────────────────────
//  Camera
// ──────────────────────────────────────────────
async function startCamera() {
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
    state.video = document.getElementById('videoEl');
    state.video.srcObject = state.stream;
    await new Promise(r => state.video.onloadedmetadata = r);
    await state.video.play();

    renderer.resizeOverlay(state.video.videoWidth, state.video.videoHeight);

    document.getElementById('cameraOverlay').classList.add('gone');
    document.getElementById('snapshotBtn').disabled = false;
    document.getElementById('stopBtn').disabled     = false;

    state.running     = true;
    state.sessionStart= Date.now();
    setStatus('live');
    sessions.startSession();
    analyzer.reset();
    state.peakStress  = 0;
    state.minStress   = 100;
    state.alertCount  = 0;
    state.allStress   = [];
    startSessionTimer();
    log(`Camera active: ${state.video.videoWidth}×${state.video.videoHeight}`, 'ok');
    requestAnimationFrame(detectionLoop);
  } catch (err) {
    log(`Camera error: ${err.message}`, 'alert');
  }
}

function stopCamera() {
  state.running = false;
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  breathing.stop();
  state.breathingActive = false;
  setStatus('ready');
  setEl('faceCount', 'NO FACE');
  setEl('fpsDisplay', '-- FPS');
  document.getElementById('scanLine').className = 'scan-line';
  renderer.clearOverlay();
  document.getElementById('cameraOverlay').classList.remove('gone');
  document.getElementById('snapshotBtn').disabled = true;
  document.getElementById('stopBtn').disabled     = true;

  const stats = analyzer.getSessionStats();
  const sess  = sessions.endSession(stats);
  if (sess) {
    renderSessionsList();
    log(`Session saved — avg stress: ${stats?.avg ?? '?'}`, 'ok');
  }
  analyzer.reset();
}

// ──────────────────────────────────────────────
//  Detection Loop
// ──────────────────────────────────────────────
async function detectionLoop(timestamp) {
  if (!state.running) return;

  // FPS
  state.frameCount++;
  if (timestamp - state.fpsTimer >= 1000) {
    state.currentFPS = state.frameCount;
    setEl('fpsDisplay', `${state.frameCount} FPS`);
    state.frameCount = 0;
    state.fpsTimer   = timestamp;
  }

  const opts = new faceapi.TinyFaceDetectorOptions({
    inputSize: DETECTION_INPUT_SIZE,
    scoreThreshold: SCORE_THRESHOLD,
  });

  try {
    let detections;
    if (state.multiFaceMode) {
      detections = await faceapi.detectAllFaces(state.video, opts)
        .withFaceLandmarks().withFaceExpressions();
    } else {
      const single = await faceapi.detectSingleFace(state.video, opts)
        .withFaceLandmarks().withFaceExpressions();
      detections = single ? [single] : [];
    }

    if (detections.length > 0) {
      const det     = detections[0];
      const result  = analyzer.analyze(det.landmarks, det.detection.box);
      const emotion = parseEmotions(det.expressions);

      // Session recording (every ~1s = every 10 frames at 10fps)
      sessions.recordFrame(result.stress, emotion, result.metrics);

      // UI
      updateStressUI(result);
      updateBiometrics(result.metrics);
      updateEmotions(emotion);
      updateHeadPose(result.metrics.headPose);

      renderer.drawFace(detections, result.level, state.multiFaceMode);
      renderer.drawGauge(result.stress);
      renderer.drawHistory(result.history, result.level.color);
      renderer.pushTimeline(result.stress, Math.round(result.metrics.focusScore.normalized * 100));
      renderer.pushEmotion(det.expressions);

      // Analytics tab update if visible
      updateAnalyticsTab(result);

      // Stats
      if (result.stress > state.peakStress) { state.peakStress = result.stress; setEl('peakStress', result.stress); }
      if (result.stress < state.minStress)  { state.minStress  = result.stress; setEl('minStress', result.stress); }
      state.allStress.push(result.stress);
      const avg = Math.round(state.allStress.reduce((a,b)=>a+b,0)/state.allStress.length);
      setEl('avgStress', avg);

      // Alerts
      handleAlerts(result.stress, result.level);

      // Auto-breathing guide
      handleBreathing(result.stress);

      // Face count
      setEl('faceCount', detections.length > 1 ? `${detections.length} FACES` : 'FACE DETECTED');
      document.getElementById('scanLine').className = 'scan-line active';
      setStatus('live');
    } else {
      setEl('faceCount', 'NO FACE');
      document.getElementById('scanLine').className = 'scan-line';
      renderer.clearOverlay();
      if (state.breathingActive && state.breathAutoMode) {
        breathing.stop();
        state.breathingActive = false;
      }
    }
  } catch (err) {
    // Frame error — silent
  }

  requestAnimationFrame(detectionLoop);
}

// ──────────────────────────────────────────────
//  Emotion Parsing
// ──────────────────────────────────────────────
function parseEmotions(expressions) {
  if (!expressions) return { dominant: 'neutral', scores: {} };
  const entries = Object.entries(expressions).sort((a,b) => b[1]-a[1]);
  const dominant = entries[0]?.[0] || 'neutral';
  const scores   = Object.fromEntries(entries);
  return { dominant, scores };
}

// ──────────────────────────────────────────────
//  UI Updates
// ──────────────────────────────────────────────
function updateStressUI(result) {
  const { stress, level } = result;
  setEl('stressNum', stress);
  document.getElementById('stressNum').style.color = level.color;
  const badge = document.getElementById('levelBadge');
  badge.className = `level-badge ${level.cls}`;
  setEl('levelText', level.label);
  setEl('alertCount', state.alertCount);

  // Background glow
  const alpha = Math.round(stress * 0.18).toString(16).padStart(2,'0');
  document.getElementById('bgGlow').style.background =
    `radial-gradient(ellipse 55% 38% at 50% 50%, ${level.color}${alpha} 0%, transparent 70%)`;
}

function updateBiometrics(metrics) {
  const { eyeOpenness, browTension, mouthTension, asymmetry, headMovement, blinkRate, focusScore, headPose } = metrics;
  setBio('eye',   eyeOpenness.label,   eyeOpenness.normalized,   eyeOpenness.normalized  < 0.3);
  setBio('brow',  browTension.label,   browTension.normalized,   browTension.normalized  > 0.6);
  setBio('mouth', mouthTension.label,  mouthTension.normalized,  mouthTension.normalized > 0.6);
  setBio('blink', blinkRate.label,     blinkRate.normalized,     blinkRate.normalized    > 0.5);
  setBio('sym',   asymmetry.label,     asymmetry.normalized,     asymmetry.normalized    > 0.5);
  setBio('head',  headMovement.label,  headMovement.normalized,  headMovement.normalized > 0.5);
  setBio('focus', focusScore.label,    focusScore.normalized,    focusScore.normalized   < 0.3);
  setBio('pose',  headPose.label,      headPose.normalized,      headPose.normalized     > 0.5);
}

function setBio(key, label, norm, elevated) {
  const val  = document.getElementById(`bv-${key}`);
  const fill = document.getElementById(`bf-${key}`);
  const card = document.getElementById(`bc-${key}`);
  if (!val) return;
  val.textContent = label;
  fill.style.width      = `${Math.min(100, norm * 100).toFixed(1)}%`;
  const critical        = norm > 0.85;
  fill.style.background = critical ? 'var(--danger)' : elevated ? 'var(--warn)' : 'var(--accent)';
  val.style.color       = critical ? 'var(--danger)' : elevated ? 'var(--warn)' : 'var(--text-1)';
  card.className        = `bio-card${critical ? ' critical' : elevated ? ' elevated' : ''}`;
}

function updateEmotions(emotion) {
  const { dominant, scores } = emotion;
  const EMOTIONS = ['neutral','happy','sad','angry','fearful','surprised','disgusted'];
  EMOTIONS.forEach(e => {
    const pct = Math.round((scores[e] || 0) * 100);
    const fill= document.getElementById(`emo-${e}`);
    const txt = document.getElementById(`epct-${e}`);
    const row = document.querySelector(`[data-emotion="${e}"]`);
    if (fill) fill.style.width = `${pct}%`;
    if (txt)  txt.textContent  = `${pct}%`;
    if (row)  row.className = `emotion-bar-row${e === dominant ? ' dominant' : ''}`;
  });
}

function updateHeadPose(pose) {
  setEl('pitchVal', `${pose.pitch}°`);
  setEl('yawVal',   `${pose.yaw}°`);
  setEl('rollVal',  `${pose.roll}°`);
  renderer.drawPose(pose.pitch, pose.yaw, pose.roll);
}

function updateAnalyticsTab(result) {
  renderer.drawTimeline();
  renderer.drawEmotionPie();
  renderer.drawDistribution(state.allStress);

  // Session summary
  const dur = state.sessionStart ? Math.round((Date.now() - state.sessionStart) / 1000) : 0;
  const mm = String(Math.floor(dur/60)).padStart(2,'0');
  const ss = String(dur % 60).padStart(2,'0');
  setEl('sumDuration',  `${mm}:${ss}`);
  setEl('sumAvg',       `${result.stress}`);
  setEl('sumPeak',      `${state.peakStress}`);
  const calms = state.allStress.filter(s => s < 20).length;
  const highs = state.allStress.filter(s => s >= 60).length;
  const total = state.allStress.length || 1;
  setEl('sumCalm',   `${Math.round(calms/total*100)}%`);
  setEl('sumHigh',   `${Math.round(highs/total*100)}%`);
  setEl('sumAlerts', `${state.alertCount}`);
  setEl('sumBlink',  `${result.metrics.blinkRate.bpm}/min`);
}

// ──────────────────────────────────────────────
//  Alerts
// ──────────────────────────────────────────────
let lastAlertTime = 0;
function handleAlerts(stress, level) {
  if (stress >= state.alertThreshold) {
    const now = Date.now();
    if (now - lastAlertTime > 8000) {
      lastAlertTime = now;
      state.alertCount++;
      setEl('alertCount', state.alertCount);
      sessions.recordAlert();
      audio.maybeAlert(stress);
      flashAlertBell();
      log(`⚠ Stress alert: ${stress}/100 — ${level.label}`, 'alert');

      const badge = document.getElementById('alertBadge');
      badge.style.display = 'flex';
      badge.textContent   = state.alertCount;
    }
  }
}

function flashAlertBell() {
  const bell = document.getElementById('alertBell');
  bell.style.color = 'var(--danger)';
  setTimeout(() => bell.style.color = '', 1500);
}

// ──────────────────────────────────────────────
//  Auto Breathing
// ──────────────────────────────────────────────
let breathCooldown = 0;
function handleBreathing(stress) {
  if (!state.breathAutoMode) return;
  const now = Date.now();
  if (stress >= state.breathThreshold && !state.breathingActive) {
    if (now - breathCooldown > 30000) { // 30s cooldown
      breathing.start();
      state.breathingActive = true;
      log('Breathing guide activated — stress is elevated', 'warn');
    }
  } else if (stress < state.breathThreshold - 10 && state.breathingActive) {
    breathing.stop();
    state.breathingActive = false;
    breathCooldown = now;
    log('Breathing guide paused — stress normalized', 'ok');
  }
}

// ──────────────────────────────────────────────
//  Session Timer
// ──────────────────────────────────────────────
let timerInterval = null;
function startSessionTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!state.running) { clearInterval(timerInterval); return; }
    const s = Math.round((Date.now() - state.sessionStart) / 1000);
    const h = String(Math.floor(s/3600)).padStart(2,'0');
    const m = String(Math.floor((s%3600)/60)).padStart(2,'0');
    const sec=String(s%60).padStart(2,'0');
    setEl('sessionTimer', `${h}:${m}:${sec}`);
    setEl('footerMid', `Session: ${h}:${m}:${sec} | ${state.currentFPS} FPS`);
  }, 1000);
}

// ──────────────────────────────────────────────
//  Tabs
// ──────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'analytics') {
        setTimeout(() => {
          renderer.drawTimeline();
          renderer.drawEmotionPie();
          renderer.drawDistribution(state.allStress);
        }, 50);
      }
    });
  });
}

// ──────────────────────────────────────────────
//  Settings
// ──────────────────────────────────────────────
function setupSettings() {
  // Sound
  document.getElementById('soundToggle').addEventListener('change', e => audio.setEnabled(e.target.checked));
  document.getElementById('alertThreshold').addEventListener('input', e => {
    state.alertThreshold = +e.target.value;
    setEl('alertThreshVal', e.target.value);
  });
  document.getElementById('alertTone').addEventListener('change', e => audio.setTone(e.target.value));
  document.getElementById('testSoundBtn').addEventListener('click', () => audio.play());

  // Detection
  document.getElementById('detectionSpeed').addEventListener('change', e => {
    DETECTION_INPUT_SIZE = +e.target.value;
    log(`Detection input size: ${DETECTION_INPUT_SIZE}`, 'info');
  });
  document.getElementById('showLandmarks').addEventListener('change', e => renderer.showLandmarks = e.target.checked);
  document.getElementById('showBBox').addEventListener('change', e => renderer.showBBox = e.target.checked);
  document.getElementById('multiFaceMode').addEventListener('change', e => {
    state.multiFaceMode = e.target.checked;
    log(`Multi-face mode: ${e.target.checked ? 'ON' : 'OFF'}`, 'info');
  });

  // Breathing
  document.getElementById('breathingAutoToggle').addEventListener('change', e => {
    state.breathAutoMode = e.target.checked;
  });
  document.getElementById('breatheThreshold').addEventListener('input', e => {
    state.breathThreshold = +e.target.value;
    setEl('breatheThreshDisplay', e.target.value);
    setEl('breatheThreshVal', e.target.value);
  });

  // Accent color swatches
  document.querySelectorAll('.swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      document.documentElement.style.setProperty('--accent', sw.dataset.color);
      document.documentElement.style.setProperty('--accent-dim', sw.dataset.color + '25');
      document.documentElement.style.setProperty('--accent-glow', sw.dataset.color + '10');
    });
  });

  // Scanlines
  document.getElementById('scanlineToggle').addEventListener('change', e => {
    document.querySelector('.scanlines').classList.toggle('hidden', !e.target.checked);
  });

  // Breathing guide panel
  document.getElementById('breathingToggle').addEventListener('change', e => {
    breathing.toggle(e.target.checked);
    state.breathingActive = e.target.checked;
  });
  document.querySelectorAll('.breathe-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.breathe-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      breathing.setPattern(btn.dataset.pattern);
      log(`Breathing pattern: ${btn.dataset.pattern}`, 'info');
    });
  });
}

// ──────────────────────────────────────────────
//  Sessions Tab
// ──────────────────────────────────────────────
function setupSessionsTab() {
  document.getElementById('exportCsvBtn').addEventListener('click',  () => sessions.exportCSV());
  document.getElementById('exportJsonBtn').addEventListener('click', () => sessions.exportJSON());
  document.getElementById('clearSessionsBtn').addEventListener('click', () => {
    if (confirm('Clear all sessions?')) {
      sessions.clearAll();
      renderSessionsList();
    }
  });
}

function renderSessionsList() {
  const list  = document.getElementById('sessionsList');
  const items = sessions.getSessions();
  if (!items.length) {
    list.innerHTML = '<div class="no-sessions">No sessions recorded yet. Start a detection session to begin recording.</div>';
    return;
  }
  list.innerHTML = items.map(s => {
    const date  = new Date(s.startTime).toLocaleString();
    const dur   = s.duration ? `${Math.round(s.duration/1000)}s` : '?';
    const color = s.avgStress >= 60 ? '#ff3b3b' : s.avgStress >= 40 ? '#ffaa00' : '#00ff99';
    return `
      <div class="session-item">
        <div class="session-item-left">
          <div class="session-date">${date}</div>
          <div class="session-meta">Duration: ${dur} · Peak: ${s.peakStress} · Emotion: ${s.dominantEmotion || '?'} · Alerts: ${s.alerts || 0}</div>
        </div>
        <div class="session-item-right">
          <span class="session-stress" style="color:${color}">AVG ${s.avgStress}</span>
          <button class="session-delete" onclick="deleteSession(${s.id})">✕</button>
        </div>
      </div>`;
  }).join('');
}

window.deleteSession = (id) => {
  sessions.deleteSession(id);
  renderSessionsList();
};

// ──────────────────────────────────────────────
//  Buttons
// ──────────────────────────────────────────────
function setupButtons() {
  document.getElementById('startBtn').addEventListener('click', startCamera);
  document.getElementById('stopBtn').addEventListener('click', stopCamera);
  document.getElementById('mirrorBtn').addEventListener('click', () => {
    state.mirror = !state.mirror;
    document.getElementById('videoEl').style.transform = state.mirror ? 'scaleX(-1)' : '';
    document.getElementById('overlayCanvas').style.transform = state.mirror ? 'scaleX(-1)' : '';
  });
  document.getElementById('snapshotBtn').addEventListener('click', takeSnapshot);
  document.getElementById('clearLogBtn').addEventListener('click', () => {
    document.getElementById('logStream').innerHTML = '';
  });
  window.addEventListener('beforeunload', () => { if (state.running) stopCamera(); });
}

function takeSnapshot() {
  const v = document.getElementById('videoEl');
  const c = document.getElementById('overlayCanvas');
  const canvas = document.createElement('canvas');
  canvas.width  = v.videoWidth;
  canvas.height = v.videoHeight;
  const ctx = canvas.getContext('2d');
  if (state.mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(v, 0, 0);
  if (!state.mirror) ctx.drawImage(c, 0, 0);
  const link = document.createElement('a');
  link.download = `neurocal_${Date.now()}.png`;
  link.href     = canvas.toDataURL('image/png');
  link.click();
  log('Snapshot saved', 'ok');
}

// ──────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────
function setStatus(s) {
  const dot   = document.getElementById('statusDot');
  const label = document.getElementById('statusLabel');
  const map   = {
    loading: ['',      'LOADING'],
    ready:   ['ready', 'READY'],
    live:    ['live',  'LIVE'],
  };
  const [cls, text] = map[s] || ['', 'OFFLINE'];
  dot.className   = `status-dot ${cls}`;
  label.textContent = text;
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

let logThrottle = {};
function log(msg, type = 'info') {
  const now  = new Date();
  const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
  const el   = document.createElement('div');
  el.className   = `log-entry ${type}`;
  el.textContent = `[ ${time} ] ${msg}`;
  const stream = document.getElementById('logStream');
  stream.appendChild(el);
  stream.scrollTop = stream.scrollHeight;
  while (stream.children.length > 150) stream.removeChild(stream.firstChild);
}
