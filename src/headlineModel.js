"use strict";

/**
 * Learned headline-style classifier: logistic regression over unigram/bigram
 * features, trained by scripts/train-headline-model.js on the public
 * Chakraborty et al. (2016) "Stop Clickbait" corpus (16k clickbait / 16k news
 * headlines). Weights live in ./data/headline-model.json.
 *
 * The featurizer is mirrored in app.py (`headline_features`) — keep them in
 * sync or the Python engine will silently score with mismatched features.
 */

const fs = require("fs");
const path = require("path");

const MODEL_PATH = path.join(__dirname, "data", "headline-model.json");

let model = null;
function loadModel() {
  if (model === null) {
    try {
      model = JSON.parse(fs.readFileSync(MODEL_PATH, "utf8"));
    } catch {
      model = false; // model missing: callers fall back to rules only
    }
  }
  return model;
}

function headlineTokens(text = "") {
  const norm = String(text).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  return (norm.match(/[a-z0-9']+|[?!]/g) || [])
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter(Boolean)
    .map((t) => (/^\d/.test(t) ? "<num>" : t));
}

function headlineFeatures(text) {
  const toks = headlineTokens(text);
  const feats = new Set();
  toks.forEach((t, i) => {
    feats.add(t);
    if (i > 0) feats.add(`${toks[i - 1]} ${t}`);
  });
  if (toks.length) feats.add(`^${toks[0]}`);
  feats.add(toks.length < 6 ? "len:short" : toks.length > 14 ? "len:long" : "len:mid");
  return [...feats];
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/**
 * @returns {{ probability: number, terms: {term: string, weight: number}[] } | null}
 *   probability that the headline is written in clickbait style, plus the
 *   features that pushed it there (positive weights first).
 */
function predictHeadline(text) {
  const m = loadModel();
  if (!m || !text) return null;
  let z = m.bias;
  const hits = [];
  for (const f of headlineFeatures(text)) {
    const w = m.weights[f];
    if (w === undefined) continue;
    z += w;
    if (!f.startsWith("len:")) hits.push({ term: f.replace(/^\^/, ""), weight: w });
  }
  hits.sort((a, b) => b.weight - a.weight);
  return { probability: sigmoid(z), terms: hits.filter((h) => h.weight > 0.4).slice(0, 6) };
}

module.exports = { predictHeadline, headlineFeatures, headlineTokens, sigmoid };
