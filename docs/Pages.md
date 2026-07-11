# Pages / Routing

There is no client-side router and effectively one HTML page.

## Routes (Node backend, `src/server.js`)

| Method | Path | Handler | Behavior |
|---|---|---|---|
| POST | `/api/analyze` | inline handler | Runs the full fetch → extract → score pipeline, returns JSON |
| GET | `/*` (catch-all) | inline handler | Always serves `public/index.html` (works because it's the only page) |
| — | any static path under `public/` | `express.static` middleware | Serves `script.js`, `styles.css`, etc. directly |

The catch-all `GET *` combined with `express.static` mounted earlier means: static files match first (via the middleware), and *any* other GET (e.g. a typo'd path, `/foo/bar`) still renders `index.html` with a 200 rather than a 404. There's no distinct 404 page or handling.

## Routes (Python backend, `app.py`)

| Method | Path | Handler | Behavior |
|---|---|---|---|
| POST | `/api/analyze` | `analyze_route` | Same contract as Node, different implementation |
| GET | `/` | `index` | `send_from_directory(".", "index.html")` — **broken**, see [[Known-Issues]] |
| GET | `/<path:filename>` | `static_files` | Serves any file relative to repo root by name — also broken for the same reason, and additionally a path-traversal-adjacent pattern worth hardening (Flask's `send_from_directory` does block `..` traversal by default, so this is a design smell rather than an active vulnerability) |

## Single Page Structure (`public/index.html`)

1. **Hero section** — static branding.
2. **Input section** — URL field + Analyze button + status text.
3. **Result section** (hidden until first successful/failed analysis) — verdict header, score/confidence pills, summary line, and an 8-panel grid: Detected Headline, Article Context, NLP Metrics, Score Breakdown, Top Signals, Body Snippet, Key Phrases & Entities, Entity Groups, Supporting Sentences.

No pagination, no modal dialogs, no secondary views.
