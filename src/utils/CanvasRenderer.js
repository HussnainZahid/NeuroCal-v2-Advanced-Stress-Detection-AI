/**
 * CanvasRenderer v2
 * Overlay drawing, gauge, sparkline, timeline, emotion pie, head pose 3D cube
 */

export class CanvasRenderer {
  constructor() {
    this.overlay      = document.getElementById('overlayCanvas');
    this.gaugeCanvas  = document.getElementById('gaugeCanvas');
    this.historyChart = document.getElementById('historyChart');
    this.timelineChart= document.getElementById('timelineChart');
    this.emoChart     = document.getElementById('emotionPieChart');
    this.distChart    = document.getElementById('distChart');
    this.poseCanvas   = document.getElementById('poseCanvas');

    this.octx = this.overlay.getContext('2d');
    this.gctx = this.gaugeCanvas.getContext('2d');
    this.hctx = this.historyChart.getContext('2d');
    this.tctx = this.timelineChart?.getContext('2d');
    this.ectx = this.emoChart?.getContext('2d');
    this.dctx = this.distChart?.getContext('2d');
    this.pctx = this.poseCanvas?.getContext('2d');

    this.showLandmarks = true;
    this.showBBox      = true;
    this.CIRC          = 2 * Math.PI * 42;

    // Timeline data
    this.timelineStress = [];
    this.timelineFocus  = [];
    this.MAX_TIMELINE   = 300;

    // Emotion distribution accumulators
    this.emotionAccum   = {};
    this.emotionColors  = {
      neutral: '#6b8aaa', happy: '#00ff99', sad: '#6b9fff',
      angry: '#ff3b3b', fearful: '#bf5fff', surprised: '#ffaa00', disgusted: '#ff9500',
    };
  }

  resizeOverlay(w, h) {
    this.overlay.width  = w;
    this.overlay.height = h;
  }

  /* ─ FACE OVERLAY ─ */
  drawFace(detections, level, multiMode) {
    const ctx = this.octx;
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    if (!detections) return;

    const list = Array.isArray(detections) ? detections : [detections];
    list.forEach((det, idx) => {
      const color = multiMode && idx > 0 ? '#bf5fff' : (level?.color || '#00e5ff');
      this._drawOneFace(ctx, det, color, idx);
    });
  }

  _drawOneFace(ctx, det, color, idx) {
    const box  = det.detection.box;
    const pts  = det.landmarks.positions;

    // Bounding box
    if (this.showBBox) {
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.5;
      ctx.shadowColor = color;
      ctx.shadowBlur  = 10;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      ctx.shadowBlur  = 0;
      // Face index label (multi-mode)
      ctx.fillStyle   = color;
      ctx.font        = '600 11px "JetBrains Mono"';
      ctx.fillText(`FACE ${idx + 1}`, box.x + 4, box.y - 6);
    }

    if (!this.showLandmarks) return;

    // Grouped landmark polylines
    const groups = [
      [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],     // jaw
      [17,18,19,20,21],                                  // left brow
      [22,23,24,25,26],                                  // right brow
      [27,28,29,30],                                     // nose bridge
      [31,32,33,34,35],                                  // nose bottom
      [36,37,38,39,40,41,36],                            // left eye
      [42,43,44,45,46,47,42],                            // right eye
      [48,49,50,51,52,53,54,55,56,57,58,59,48],         // outer lip
      [60,61,62,63,64,65,66,67,60],                     // inner lip
    ];

    ctx.strokeStyle = color + 'aa';
    ctx.lineWidth   = 1;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 3;

    groups.forEach(grp => {
      ctx.beginPath();
      grp.forEach((i, j) => j === 0 ? ctx.moveTo(pts[i].x, pts[i].y) : ctx.lineTo(pts[i].x, pts[i].y));
      ctx.stroke();
    });

    // Landmark dots
    ctx.shadowBlur = 0;
    ctx.fillStyle  = color + '70';
    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2);
      ctx.fill();
    });

    // Key points highlight (eyes, nose, mouth corners)
    [36, 39, 42, 45, 30, 48, 54].forEach(i => {
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur  = 5;
      ctx.fill();
    });
    ctx.shadowBlur = 0;
  }

  clearOverlay() {
    this.octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  /* ─ GAUGE ─ */
  drawGauge(score) {
    const canvas = this.gaugeCanvas;
    const ctx    = this.gctx;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2, cy = H - 6, r = H - 20;
    const startA = Math.PI, endA = 0;
    const color  = this._scoreColor(score);

    // Background arc
    ctx.beginPath();
    ctx.arc(cx, cy, r, startA, endA);
    ctx.strokeStyle = '#1a2535'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.stroke();

    // Colored arc
    if (score > 0) {
      const fillA = startA + Math.PI * (score / 100);
      const grad  = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, '#00e5ff');
      grad.addColorStop(1, color);
      ctx.beginPath();
      ctx.arc(cx, cy, r, startA, fillA);
      ctx.strokeStyle = grad; ctx.lineWidth = 8; ctx.lineCap = 'round';
      ctx.shadowColor = color; ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Tick marks
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI + Math.PI * i / 10;
      const inner = r - (i % 5 === 0 ? 15 : 8);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.lineTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.strokeStyle = '#243550'; ctx.lineWidth = 1; ctx.shadowBlur = 0;
      ctx.stroke();
    }
  }

  /* ─ HISTORY SPARKLINE ─ */
  drawHistory(history, color) {
    const canvas = this.historyChart;
    const ctx    = this.hctx;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (history.length < 2) return;

    const step = W / (history.length - 1);
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, color + '55');
    grad.addColorStop(1, color + '00');

    ctx.beginPath();
    history.forEach((v, i) => {
      const x = i * step, y = H - (v / 100) * H;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath();
    history.forEach((v, i) => {
      const x = i * step, y = H - (v / 100) * H;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.shadowColor = color; ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  /* ─ TIMELINE CHART (Analytics tab) ─ */
  pushTimeline(stress, focus) {
    this.timelineStress.push(stress);
    this.timelineFocus.push(focus);
    if (this.timelineStress.length > this.MAX_TIMELINE) {
      this.timelineStress.shift();
      this.timelineFocus.shift();
    }
  }

  drawTimeline() {
    const canvas = this.timelineChart;
    if (!canvas || !this.tctx) return;
    const ctx = this.tctx;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (this.timelineStress.length < 2) return;

    this._drawLine(ctx, this.timelineStress, W, H, '#00e5ff');
    this._drawLine(ctx, this.timelineFocus,  W, H, '#00ff99', true);

    // Threshold line at 70
    const y70 = H - (70 / 100) * H;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y70); ctx.lineTo(W, y70);
    ctx.strokeStyle = 'rgba(255,59,59,0.3)'; ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,59,59,0.4)';
    ctx.font = '9px JetBrains Mono';
    ctx.fillText('ALERT THRESHOLD', 4, y70 - 3);
  }

  _drawLine(ctx, data, W, H, color, dashed = false) {
    const step = W / (data.length - 1);
    if (dashed) ctx.setLineDash([3, 3]);
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = i * step, y = H - (v / 100) * H;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.shadowColor = color; ctx.shadowBlur = 3;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
  }

  /* ─ EMOTION PIE ─ */
  pushEmotion(emotions) {
    Object.entries(emotions).forEach(([k, v]) => {
      this.emotionAccum[k] = (this.emotionAccum[k] || 0) + v;
    });
  }

  drawEmotionPie() {
    const canvas = this.emoChart;
    if (!canvas || !this.ectx) return;
    const ctx = this.ectx;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const total = Object.values(this.emotionAccum).reduce((a, b) => a + b, 0);
    if (total === 0) return;

    const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 10;
    let startA = -Math.PI / 2;

    const legend = document.getElementById('pieLegend');
    if (legend) legend.innerHTML = '';

    Object.entries(this.emotionAccum).forEach(([emo, val]) => {
      if (val === 0) return;
      const slice = (val / total) * Math.PI * 2;
      const color = this.emotionColors[emo] || '#888';

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startA, startA + slice);
      ctx.closePath();
      ctx.fillStyle   = color;
      ctx.shadowColor = color;
      ctx.shadowBlur  = 6;
      ctx.fill();
      ctx.shadowBlur  = 0;

      // Border
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startA, startA + slice);
      ctx.closePath();
      ctx.strokeStyle = '#06090d'; ctx.lineWidth = 2;
      ctx.stroke();

      // Legend
      if (legend) {
        const pct  = ((val / total) * 100).toFixed(1);
        const item = document.createElement('div');
        item.className = 'pie-legend-item';
        item.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></span>${emo} ${pct}%`;
        legend.appendChild(item);
      }

      startA += slice;
    });
  }

  /* ─ STRESS DISTRIBUTION BAR ─ */
  drawDistribution(scores) {
    const canvas = this.distChart;
    if (!canvas || !this.dctx || !scores.length) return;
    const ctx = this.dctx;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const buckets = new Array(10).fill(0);
    scores.forEach(s => buckets[Math.min(9, Math.floor(s / 10))]++);
    const max = Math.max(...buckets);

    const labels = ['0-10','10-20','20-30','30-40','40-50','50-60','60-70','70-80','80-90','90-100'];
    const bw     = W / 10 - 4;
    const colors = ['#00ff99','#00ff99','#00e5ff','#00e5ff','#ffaa00','#ffaa00','#ff9500','#ff3b3b','#ff3b3b','#ff0055'];

    buckets.forEach((v, i) => {
      const bh  = max > 0 ? (v / max) * (H - 22) : 0;
      const x   = i * (W / 10) + 2;
      const y   = H - bh - 20;
      ctx.fillStyle = colors[i] + '99';
      ctx.fillRect(x, y, bw, bh);
      ctx.strokeStyle = colors[i];
      ctx.lineWidth   = 1;
      ctx.strokeRect(x, y, bw, bh);

      ctx.fillStyle = '#2d4460';
      ctx.font      = '7px JetBrains Mono';
      ctx.fillText(labels[i].split('-')[0], x, H - 4);
    });
  }

  /* ─ HEAD POSE 3D CUBE ─ */
  drawPose(pitch, yaw, roll) {
    const canvas = this.poseCanvas;
    if (!canvas || !this.pctx) return;
    const ctx = this.pctx;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2;
    const size = 42;

    // Convert degrees to radians
    const pR = (pitch || 0) * Math.PI / 180;
    const yR = (yaw   || 0) * Math.PI / 180;
    const rR = (roll  || 0) * Math.PI / 180;

    // Rotation matrix
    const rot = this._rotMatrix(pR, yR, rR);

    // Cube vertices
    const s  = size;
    const verts3d = [
      [-s,-s,-s],[s,-s,-s],[s,s,-s],[-s,s,-s],
      [-s,-s, s],[s,-s, s],[s,s, s],[-s,s, s],
    ];

    // Project
    const verts2d = verts3d.map(v => {
      const rx = rot[0]*v[0] + rot[1]*v[1] + rot[2]*v[2];
      const ry = rot[3]*v[0] + rot[4]*v[1] + rot[5]*v[2];
      const rz = rot[6]*v[0] + rot[7]*v[1] + rot[8]*v[2];
      const z = rz + 250;
      return [ cx + rx * (250 / z), cy + ry * (250 / z) ];
    });

    // Faces [indices, color]
    const faces = [
      [[0,1,2,3], 'rgba(0,229,255,0.08)'],
      [[4,5,6,7], 'rgba(0,229,255,0.08)'],
      [[0,1,5,4], 'rgba(0,229,255,0.05)'],
      [[2,3,7,6], 'rgba(0,229,255,0.05)'],
      [[0,3,7,4], 'rgba(0,229,255,0.05)'],
      [[1,2,6,5], 'rgba(0,229,255,0.05)'],
    ];

    // Draw filled faces
    faces.forEach(([idxs, fill]) => {
      ctx.beginPath();
      idxs.forEach((i, j) => j===0 ? ctx.moveTo(verts2d[i][0], verts2d[i][1]) : ctx.lineTo(verts2d[i][0], verts2d[i][1]));
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = '#00e5ff44'; ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Axis arrows from center
    const axes = [
      { dir: [1,0,0], color: '#ff6b6b', label: 'X' },
      { dir: [0,1,0], color: '#6bff8a', label: 'Y' },
      { dir: [0,0,1], color: '#6b9fff', label: 'Z' },
    ];
    axes.forEach(({ dir, color, label }) => {
      const end3 = dir.map(d => d * 60);
      const rx = rot[0]*end3[0]+rot[1]*end3[1]+rot[2]*end3[2];
      const ry = rot[3]*end3[0]+rot[4]*end3[1]+rot[5]*end3[2];
      const rz = rot[6]*end3[0]+rot[7]*end3[1]+rot[8]*end3[2];
      const z  = rz + 250;
      const ex = cx + rx*(250/z), ey = cy + ry*(250/z);
      ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.lineTo(ex, ey);
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.shadowColor = color; ctx.shadowBlur = 4;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = color; ctx.font = 'bold 9px JetBrains Mono';
      ctx.fillText(label, ex+3, ey+3);
    });
  }

  _rotMatrix(pitch, yaw, roll) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cy = Math.cos(yaw),   sy = Math.sin(yaw);
    const cr = Math.cos(roll),  sr = Math.sin(roll);
    // Rx * Ry * Rz
    return [
      cy*cr,            cy*sr,           -sy,
      sp*sy*cr-cp*sr,   sp*sy*sr+cp*cr,   sp*cy,
      cp*sy*cr+sp*sr,   cp*sy*sr-sp*cr,   cp*cy,
    ];
  }

  _scoreColor(score) {
    if (score < 20) return '#00ff99';
    if (score < 40) return '#00e5ff';
    if (score < 60) return '#ffaa00';
    if (score < 80) return '#ff3b3b';
    return '#ff0055';
  }
}
