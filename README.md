# 🧠 NeuroCal v2 — Advanced Stress Detection AI

Real-time facial AI stress detector with **8 biometric channels**, **emotion detection**, **breathing guide**, **audio alerts**, **head pose estimation**, **session recording**, and full **CSV/JSON export**.

---

## 📁 Project Structure

```
stress-detector-v2/
├── index.html                      # Full UI — 4 tabs: Dashboard, Analytics, Sessions, Settings
├── package.json
├── setup.js                        # Downloads model weights (run once)
├── models/                         # Model files (populated by setup.js)
│   ├── tiny_face_detector_model-*
│   ├── face_landmark_68_model-*
│   └── face_expression_model-*     ← NEW: emotion detection
└── src/
    ├── main.js                     # App entry — detection loop, all orchestration
    ├── styles/
    │   └── main.css                # Industrial dark UI with 4-tab navigation
    └── utils/
        ├── StressAnalyzer.js       # 8-channel stress & focus algorithm
        ├── CanvasRenderer.js       # Overlay, gauge, sparkline, pose cube, pie chart
        ├── BreathingGuide.js       # Animated breathing exercise controller
        ├── AudioAlert.js           # Web Audio API alert tones (no files needed)
        └── SessionManager.js       # Session recording + localStorage + CSV/JSON export
```

---

## 🚀 Quick Start

```bash
# 1. Download AI models (~18MB)
node setup.js

# 2. Launch local server (must be HTTP, not file://)
npm start
# → http://localhost:3000
```

---

## ✨ New Features in v2

### 🎭 Emotion Detection (7 classes)
Uses `faceExpressionNet` to classify: **neutral, happy, sad, angry, fearful, surprised, disgusted**
- Live emotion bars in the Dashboard
- Emotion distribution pie chart in Analytics tab
- Dominant emotion logged in session history

### 📊 Analytics Tab
- **Full session timeline** — stress + focus over time with alert threshold line
- **Emotion pie chart** — accumulated distribution across the session
- **Stress distribution bar chart** — histogram across 10 buckets
- **Session summary** — avg, peak, min, % calm, % high, alerts, blink rate

### 💾 Session Recording & Export
- Every session is auto-saved to `localStorage` (up to 20 sessions retained)
- **Sessions tab** — view all past sessions with timestamps, stress levels, dominant emotion
- **Export CSV** — per-frame data: `time_ms, stress, emotion, focus, pitch, yaw, roll, blink_rate`
- **Export JSON** — session summaries for all sessions

### 🫁 Breathing Guide
- Animated circular breathing ring with phase countdown
- 3 patterns: **Box 4-4-4-4**, **4-7-8**, **Calm 6-2-6**
- **Auto-trigger**: activates when stress exceeds threshold (default 70), stops when stress drops
- Manual toggle in Dashboard

### 🔔 Audio Alerts
- Web Audio API (no audio files needed — pure synthesis)
- 3 tones: **Beep** (stress-pitched sine), **Pulse** (multi-beep square), **Chime** (C-E-G triangle)
- Configurable threshold and 8s cooldown to prevent spam
- Alert counter with bell icon flash

### 🧭 Head Pose Estimation (Pitch / Yaw / Roll)
- Approximated from landmark geometry — no 3D model required
- **3D rotating cube** visualization responds in real-time
- RGB axis arrows: Red=Pitch, Green=Yaw, Blue=Roll
- Pose stress contribution in biometrics panel

### 🎯 Focus Score
- Composite of eye openness + brow relaxation + head steadiness
- Plotted alongside stress in the timeline chart

### 📷 Other Improvements
- **Mirror mode** — flip camera horizontally
- **Snapshot** — saves annotated frame as PNG
- **Multi-face mode** — track multiple people simultaneously
- **Accent color picker** — 5 theme colors
- **Scanline effect** toggle
- **Configurable detection quality** (4 speed presets)
- Session timer in camera bar

---

## 🧬 Detection Pipeline

```
Webcam Frame
    ↓
TinyFaceDetector  →  face bounding box
    ↓
FaceLandmark68Net →  68 landmark points
    ↓
FaceExpressionNet →  7 emotion probabilities
    ↓
StressAnalyzer    →  8 biometric signals → composite score (0-100)
    ↓
BreathingGuide?   →  auto-trigger if stress ≥ threshold
AudioAlert?       →  sound if stress ≥ threshold
SessionManager    →  record frame to session
    ↓
CanvasRenderer    →  overlay + gauge + sparkline + pose cube
```

---

## ⚙ Configuration (Settings Tab)

| Setting | Default | Notes |
|---|---|---|
| Alert threshold | 70 | Trigger audio + breathing at this stress level |
| Breathing auto-trigger | ON | Activates guide automatically |
| Detection speed | Accurate (320) | Reduce to 128/224 for lower-powered devices |
| Multi-face mode | OFF | Track multiple faces simultaneously |
| Show landmarks | ON | 68-point overlay on face |
| Accent color | Cyan | 5 color options |
| Scanline effect | ON | CRT retro overlay |

---

## ⚠ Disclaimer
NeuroCal is a **wellness exploration tool** — not a medical device. Stress estimates are heuristic approximations from facial geometry and should not be used for clinical, diagnostic, or high-stakes decisions.

---

## 🛠 Troubleshooting

| Issue | Solution |
|---|---|
| `Model load failed` | Run `node setup.js` first; must serve over HTTP |
| Camera permission denied | Allow camera in browser settings |
| Low FPS | Change detection to "Fast" in Settings |
| Emotion always neutral | Ensure face is well-lit and clearly visible |
| No audio | Click anywhere on the page first (browser autoplay policy) |
# NeuroCal-v2-Advanced-Stress-Detection-AI
