# Project Overview

**Name:** BaitBlock (package name: `clickbait-detection-webapp`)
**Type:** Single-page web app + JSON API
**Purpose:** Given a news article URL, fetch the page, extract the headline/body, and produce a heuristic "clickbait risk" score (0-100) with an explainable signal breakdown.

## Problem It Solves

Readers can't quickly tell whether a headline honestly represents the article behind it. BaitBlock automates a first-pass check by comparing the headline against the article body (semantic/lexical overlap) and scanning the headline for known clickbait phrasing, punctuation abuse, and emotionally loaded language. It is explicitly **not** a fact-checker — it flags *framing* risk, not factual accuracy.

## Primary User Flow

1. User opens the single page (`public/index.html`), pastes an article URL, clicks **Analyze**.
2. Frontend JS (`public/script.js`) POSTs `{ url }` to `POST /api/analyze`.
3. Backend fetches the URL server-side, extracts headline + body text, computes a composite score and supporting signals, and returns JSON.
4. Frontend renders a color-coded verdict card (safe / warning / risky) with score, confidence, metrics, key phrases, named entities, and supporting sentences.

There is no login, no history, no persistence — every analysis is a single stateless round trip.

## Two Backends, One Contract

This repository actually contains **two independent server implementations** that both implement the same `/api/analyze` JSON contract for the same static frontend:

| Backend | Entry point | Status |
|---|---|---|
| Node.js / Express, regex heuristics | `src/server.js` (`npm start`) | **Live** — this is what `package.json` actually runs and what the README documents |
| Python / Flask, real NLP (spaCy, SBERT, VADER) | `app.py` (`start.ps1` / `python app.py`) | **Present but effectively dead** — its static file wiring is broken (see [[Known-Issues]]) |

Only the Node backend is wired to ship today. See [[Architecture]] for details and [[Decision-Log]] for the reasoning inferred from the code.

## Evaluation/Charts Side-Project

A separate set of `plot_*.py` scripts reads small hand-authored CSVs (`results.csv`, `confusion_matrix.csv`, `domain_components.csv`, `radar_components.csv`, `violin_data.csv`) and renders the seven `fig*.png` charts embedded in `README.md`. This is a **static reporting pipeline**, not a live benchmark harness — nothing in the repo runs the analyzer against a labeled dataset and writes these CSVs automatically. Treat the charts as illustrative, not as measured accuracy of the shipped Node engine. See [[Known-Issues]].

## At a Glance

- **Live stack:** Node.js, Express, Cheerio, vanilla HTML/CSS/JS frontend, no database, no auth, no tests, no CI.
- **Dormant stack:** Python, Flask, spaCy, sentence-transformers, NLTK, TextBlob, newspaper3k, BeautifulSoup.
- **Deployment:** none configured (no Dockerfile, no platform config); designed to be run locally.
