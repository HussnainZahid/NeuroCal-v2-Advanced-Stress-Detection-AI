#!/usr/bin/env node
/**
 * setup.js — Downloads all required face-api.js model weights
 *
 * Run ONCE before launching:
 *   node setup.js
 *
 * Models (~18MB total):
 *   - tiny_face_detector_model   (fast face detection)
 *   - face_landmark_68_model     (68 facial landmark points)
 *   - face_expression_model      (7 emotion classes)
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const BASE  = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';
const DIR   = path.join(__dirname, 'models');

const FILES = [
  // Tiny Face Detector (~190KB)
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1',
  // Face Landmark 68 (~350KB)
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  // Face Expression / Emotion (~310KB)
  'face_expression_model-weights_manifest.json',
  'face_expression_model-shard1',
];

if (!fs.existsSync(DIR)) {
  fs.mkdirSync(DIR, { recursive: true });
  console.log('✓ Created ./models/');
}

let done = 0;

function download(filename) {
  return new Promise((resolve, reject) => {
    const dest = path.join(DIR, filename);
    if (fs.existsSync(dest)) {
      console.log(`  ⏭  Skip (exists): ${filename}`);
      done++; resolve(); return;
    }
    const file = fs.createWriteStream(dest);
    https.get(`${BASE}/${filename}`, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} — ${filename}`)); return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        done++;
        const pct = Math.round((done / FILES.length) * 100);
        console.log(`  ✓  [${pct}%] ${filename}`);
        resolve();
      });
    }).on('error', err => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

(async () => {
  console.log('\n🧠 NeuroCal v2 — Model Setup\n');
  console.log(`Downloading ${FILES.length} model files (~18MB)...\n`);
  for (const f of FILES) {
    try { await download(f); }
    catch (e) { console.error(`  ✗  FAILED: ${f}\n     ${e.message}`); }
  }
  console.log(`\n✅ ${done}/${FILES.length} model files ready.\n`);
  console.log('Start the app:');
  console.log('  npm start   →  http://localhost:3000\n');
})();
