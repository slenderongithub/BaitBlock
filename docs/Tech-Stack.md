# Tech Stack

## Live (Node.js) Stack — what actually runs via `npm start`

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Node.js | No `engines` field pinned in `package.json` |
| Web framework | Express `^4.21.2` | Serves static files + one JSON API route |
| HTML parsing | Cheerio `^1.0.0` | jQuery-like server-side DOM parsing of fetched article HTML |
| HTTP fetch | Native `fetch()` (Node 18+) | Used to retrieve the target article |
| Frontend | Vanilla HTML/CSS/JS, no framework, no bundler | `public/index.html`, `public/script.js`, `public/styles.css` |
| Fonts | Google Fonts (Archivo Black, Space Grotesk) | Loaded via `<link>`, external network dependency |
| Package manager | npm (`package-lock.json` present) | |

No test runner, no linter, no TypeScript, no build step — `public/` is served as-is.

## Dormant (Python) Stack — `app.py`, not wired to the live frontend correctly

| Layer | Technology | Purpose |
|---|---|---|
| Web framework | Flask | Mirrors the same `/api/analyze` contract |
| Scraping | `newspaper3k` (primary), BeautifulSoup4 + `requests` (fallback) | Two-tier extraction, see [[Data-Flow]] |
| NLP | spaCy (`en_core_web_sm`) | Lemmatization, named-entity recognition, sentence segmentation |
| Semantic similarity | `sentence-transformers` (`all-MiniLM-L6-v2`) + scikit-learn cosine similarity | Headline/body embedding comparison; falls back to a hand-rolled hashed bag-of-words embedding if the model can't load |
| Sentiment | NLTK `SentimentIntensityAnalyzer` (VADER), fallback to TextBlob | Headline polarity |
| ML runtime | PyTorch, Hugging Face Transformers (transitive via sentence-transformers) | Heavyweight; models cached under `.cache/huggingface` (see `start.ps1`) |
| Dependency list | `requirements.txt` | **Unpinned versions** — no `==` version pins |

## Evaluation/Reporting Scripts (separate concern)

`matplotlib`, `pandas`, `numpy` — used by the seven `plot_*.py` scripts to turn static CSVs into the charts embedded in `README.md`. Not imported by either server; run manually, standalone.

## Tooling / Repo-level

- Git, single `main`-style branch, one commit at time of this analysis (`ed48fa1`).
- `.code-review-graph/` — a local code-graph MCP tool cache (`graph.db`), unrelated to app runtime.
- `start.ps1` — Windows PowerShell launcher for the Python backend that sets Hugging Face cache env vars.
- No Docker, no CI (no `.github/workflows`), no environment-variable template (`.env.example`).

See [[Environment]] for the environment variables each stack actually reads.
