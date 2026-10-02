"use strict";

/**
 * Train the headline-style logistic regression used by src/headlineModel.js.
 *
 *   node scripts/train-headline-model.js [dataDir]
 *
 * Data: the public "Stop Clickbait" corpus (Chakraborty et al., ASONAM 2016),
 * https://github.com/bhargaviparanjape/clickbait/tree/master/dataset
 * Download clickbait_data.gz + non_clickbait_data.gz and gunzip them into
 * dataDir (default ./.cache/clickbait-data). The corpus is NOT committed; only
 * the learned weights are.
 *
 * Prints held-out (20%) accuracy / precision / recall / F1 and writes
 * src/data/headline-model.json.
 */

const fs = require("fs");
const path = require("path");
const { headlineFeatures, sigmoid } = require("../src/headlineModel");

const dataDir = process.argv[2] || path.join(__dirname, "..", ".cache", "clickbait-data");
const OUT = path.join(__dirname, "..", "src", "data", "headline-model.json");
const KEEP = 14000; // features kept after pruning by |weight|

function readLines(file) {
  return fs
    .readFileSync(path.join(dataDir, file), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// Deterministic shuffle (mulberry32) so metrics are reproducible.
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rows = [
  ...readLines("clickbait_data").map((t) => ({ t, y: 1 })),
  ...readLines("non_clickbait_data").map((t) => ({ t, y: 0 })),
];
const rand = rng(42);
for (let i = rows.length - 1; i > 0; i -= 1) {
  const j = Math.floor(rand() * (i + 1));
  [rows[i], rows[j]] = [rows[j], rows[i]];
}
rows.forEach((r) => (r.f = headlineFeatures(r.t)));
const split = Math.floor(rows.length * 0.8);
const train = rows.slice(0, split);
const test = rows.slice(split);

// Vocabulary: features seen at least 3 times in training data.
const counts = new Map();
train.forEach((r) => r.f.forEach((f) => counts.set(f, (counts.get(f) || 0) + 1)));
const vocab = new Set([...counts].filter(([, c]) => c >= 3).map(([f]) => f));

// Logistic regression, Adagrad + L2.
const w = new Map();
const g2 = new Map();
let bias = 0;
let bg2 = 0;
const LR = 0.3;
const L2 = 1e-5;
for (let epoch = 0; epoch < 10; epoch += 1) {
  for (const r of train) {
    const fs_ = r.f.filter((f) => vocab.has(f));
    let z = bias;
    fs_.forEach((f) => (z += w.get(f) || 0));
    const g = sigmoid(z) - r.y;
    bg2 += g * g;
    bias -= (LR * g) / Math.sqrt(bg2 + 1e-8);
    fs_.forEach((f) => {
      const wf = w.get(f) || 0;
      const gf = g + L2 * wf;
      const acc = (g2.get(f) || 0) + gf * gf;
      g2.set(f, acc);
      w.set(f, wf - (LR * gf) / Math.sqrt(acc + 1e-8));
    });
  }
}

function evaluate(weights, b) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (const r of test) {
    let z = b;
    r.f.forEach((f) => (z += weights.get(f) || 0));
    const pred = z > 0 ? 1 : 0;
    if (pred && r.y) tp += 1;
    else if (pred) fp += 1;
    else if (r.y) fn += 1;
    else tn += 1;
  }
  const precision = tp / (tp + fp);
  const recall = tp / (tp + fn);
  return {
    accuracy: +((tp + tn) / test.length).toFixed(4),
    precision: +precision.toFixed(4),
    recall: +recall.toFixed(4),
    f1: +((2 * precision * recall) / (precision + recall)).toFixed(4),
    test_size: test.length,
  };
}

const full = evaluate(w, bias);
const pruned = new Map(
  [...w]
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, KEEP)
    .map(([f, v]) => [f, +v.toFixed(3)])
);
const metrics = evaluate(pruned, bias);
console.log("full vocab", vocab.size, full);
console.log(`pruned to ${KEEP}`, metrics);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    source: "Chakraborty et al. 2016 'Stop Clickbait' corpus, 80/20 split, seed 42",
    metrics,
    bias: +bias.toFixed(4),
    weights: Object.fromEntries(pruned),
  })
);
console.log("wrote", OUT);
