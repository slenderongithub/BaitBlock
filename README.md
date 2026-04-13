# ClickbaitDetection

Lightweight web app that analyzes a news URL and estimates clickbait/deceptive framing using content extraction + heuristic NLP-style scoring.

![Node.js](https://img.shields.io/badge/Node.js-Express-1f6f43)
![Frontend](https://img.shields.io/badge/Frontend-HTML%2FCSS%2FJS-1d4ed8)
![API](https://img.shields.io/badge/API-POST%20%2Fapi%2Fanalyze-f59e0b)

## What It Does

- Fetches article HTML from a given URL.
- Extracts headline, readable body text, metadata, and supporting sentences.
- Detects clickbait patterns and deception hints.
- Computes a composite risk score with explainable signal breakdown.
- Renders a visual results dashboard with verdict, confidence, and metrics.

## Quick Start

```bash
cd /Users/slender/Developer/Codes/ClickbaitDetection
npm install
npm start
```

Open: `http://localhost:3000`

If port 3000 is already in use:

```bash
lsof -ti tcp:3000 | xargs kill -9
npm start
```

## Architecture

```mermaid
flowchart LR
   U[User URL Input] --> FE[Frontend UI public]
   FE --> API[POST /api/analyze]
   API --> FETCH[Remote Article Fetch]
   FETCH --> EXTRACT[Headline + Body + Metadata Extraction]
   EXTRACT --> SCORE[Heuristic Scoring + Signals]
   SCORE --> RES[JSON Result]
   RES --> FE
```

## API

### `POST /api/analyze`

Request:

```json
{ "url": "https://example.com/article" }
```

Key response fields:

- `verdict`
- `composite_sensationalism_score`
- `legitimacy_confidence_score`
- `headline`
- `body_snippet`
- `signals`
- `score_breakdown`
- `cosine_similarity_score`
- `sentiment_polarity`

## Project Structure

```text
ClickbaitDetection/
   public/
      index.html
      script.js
      styles.css
   src/
      server.js
   package.json
```

## Screenshots

### Web App UI

1. Home screen and URL input

![Step 1 - Home and Input](./screenshots/ui-1.png)

2. Analysis completed with verdict and top-level result cards

![Step 2 - Verdict and Summary](./screenshots/ui-2.png)

3. Mid-page diagnostics: NLP metrics, score breakdown, body snippet

![Step 3 - Diagnostics](./screenshots/ui-3.png)

4. Deep details: key phrases, entity groups, and supporting sentences

![Step 4 - Deep Analysis Details](./screenshots/ui-4.png)

### Evaluation Charts

![Bar Graph](./fig1_bar_graph.png)
![Radar Graph](./fig2_radar_graph.png)
![Confusion Matrix](./fig3_confusion_matrix.png)

![Violin Plot](./fig4_violin_plot.png)
![Grouped Domain Components](./fig5_grouped_domain_components.png)
![PR Curves](./fig6_pr_curves.png)
![Threshold Sensitivity](./fig7_threshold_sensitivity.png)

## GitHub About (Copy/Paste)

### Short Description

AI-powered clickbait detection web app that analyzes news URLs and scores headline credibility using explainable heuristic signals.

### Suggested Topics

`clickbait-detection`, `fake-news`, `nlp`, `news-analysis`, `javascript`, `nodejs`, `express`, `web-app`, `text-analysis`, `heuristics`

## Notes

- This is a heuristic estimate, not a final fact-check verdict.
- Some websites block automated fetch requests or render content dynamically, which can reduce extraction quality.
