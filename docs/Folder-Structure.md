# Folder Structure

> **Updated for v1.1.0.** The duplicate root `script.js`/`server.js` were deleted. `src/` now holds modules (`config.js`, `ssrfGuard.js`, `safeFetch.js`, `extraction.js`, `scoring.js`, `nlp.js`, `analyze.js`, `errors.js`, `textUtils.js`, `lexicons.js`, `server.js`). New: `tests/` (node:test), `.github/` (CI + Dependabot), `public/theme.js`, `public/robots.txt`, `.env.example`, `LICENSE`, `CHANGELOG.md`, `start.sh`, `eslint.config.js`, `.prettierrc.json`. See [[../CHANGELOG]] for the authoritative layout.

```text
ClickbaitDetection/
├── app.py                    # Dormant Python/Flask NLP backend (see Known-Issues)
├── requirements.txt          # Unpinned Python deps for app.py
├── start.ps1                 # Windows launcher for app.py (.venv + HF cache env vars)
│
├── package.json              # Node app manifest — main/start point to src/server.js
├── package-lock.json
├── src/
│   └── server.js             # LIVE backend. Regex/heuristic scoring engine. Serves ../public
│
├── public/                   # LIVE frontend, served as static files by src/server.js
│   ├── index.html            # Single page: input form + result dashboard
│   ├── script.js             # Fetches /api/analyze, renders the result card
│   └── styles.css            # "Neo-brutalist" styling (thick borders, hard shadows)
│
├── script.js                 # ⚠ Untracked duplicate of public/script.js (byte-identical)
├── server.js                 # ⚠ Untracked near-duplicate of src/server.js (serves __dirname instead of ../public)
│
├── plot_bar_graph.py         # Reads results.csv               → fig1_bar_graph.png
├── plot_radar_graph.py       # Reads radar_components.csv      → fig2_radar_graph.png
├── plot_confusion_matrix.py  # Reads confusion_matrix.csv      → fig3_confusion_matrix.png
├── plot_violin_graph.py      # Reads violin_data.csv           → fig4_violin_plot.png
├── plot_grouped_domain_components.py  # Reads domain_components.csv → fig5_grouped_domain_components.png
├── plot_pr_curves.py         # → fig6_pr_curves.png
├── plot_threshold_sensitivity.py      # → fig7_threshold_sensitivity.png
├── results.csv, confusion_matrix.csv, domain_components.csv,
│   radar_components.csv, violin_data.csv   # Small hand-authored sample datasets
├── fig1_bar_graph.png … fig7_threshold_sensitivity.png  # Generated chart images, committed to git
│
├── screenshots/
│   └── ui-1.png … ui-4.png   # App walkthrough screenshots used in README
│
├── README.md
├── .gitignore                 # Ignores .venv, __pycache__, .cache, node_modules, *.pyc, .DS_Store
├── .code-review-graph/        # Local MCP code-graph tool cache (graph.db) — not app-related
└── .claude/settings.local.json
```

## Organization Philosophy (as observed, not necessarily intentional)

- **`public/` vs `src/`** follows a conventional Express static-site split: `src/` for server code, `public/` for anything the browser downloads directly.
- **Root-level `app.py` + Python data/plot files** were dropped directly into the repo root rather than under something like `python/` or `ml/` — there is no folder boundary between "the live JS app" and "the Python experiment/reporting scripts." This flat layout is the main source of clutter (30+ files at repo root).
- **No `tests/`, `docs/` (before this session), `scripts/`, or `config/` directories** existed prior to this analysis.
- The two untracked root files (`script.js`, `server.js`) suggest an in-progress, abandoned attempt to flatten `public/`+`src/` into the repo root; they were never committed and never wired into `package.json`. See [[Known-Issues]] and [[Decision-Log]].
