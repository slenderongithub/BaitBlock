# Environment Configuration

> **Updated for v1.1.0.** A `.env.example` now exists. New Node env vars: `CLICKBAIT_FETCH_TIMEOUT_MS`, `CLICKBAIT_FETCH_MAX_BYTES`, `CLICKBAIT_FETCH_MAX_REDIRECTS`, `CLICKBAIT_USER_AGENT`, `CLICKBAIT_RATE_WINDOW_MS`, `CLICKBAIT_RATE_MAX`, `CLICKBAIT_ALLOW_PRIVATE` (all read in `src/config.js`). New Python env var: `CLICKBAIT_EMBEDDING_MODEL` (default `sentence-transformers/all-mpnet-base-v2`). `CLICKBAIT_ALLOW_PRIVATE` also gates the Python SSRF guard. Keep `CLICKBAIT_ALLOW_PRIVATE` off in production.

No `.env` file, no `.env.example`, and no `dotenv` usage in either backend — all configuration is via OS environment variables read directly by `process.env` / `os.environ`, with defaults baked into the code.

## Node Backend (`src/server.js`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |

That's the only environment variable the live backend reads.

## Python Backend (`app.py`) and `start.ps1`

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Flask listen port |
| `CLICKBAIT_MODEL_CACHE` | `<repo>/.cache/huggingface` | Root cache dir for HF/SBERT models |
| `HF_HOME` | same as above | Hugging Face Hub cache root |
| `TRANSFORMERS_CACHE` | same as above | Transformers model cache |
| `SENTENCE_TRANSFORMERS_HOME` | same as above | sentence-transformers cache |
| `TRANSFORMERS_NO_TORCHVISION` | `1` | Skip an unneeded torchvision import path |
| `HF_HUB_DISABLE_TELEMETRY` | `1` | Disables HF telemetry pings |
| `HF_HUB_DISABLE_PROGRESS_BARS` | `1` | Quiets download progress bars |
| `HF_HUB_OFFLINE` | unset, settable via `start.ps1 -Offline` | Forces offline mode once models are cached |

`start.ps1` sets all of these before launching `.venv`'s Python interpreter against `app.py`; there is no equivalent shell script for macOS/Linux, so the Python path is Windows-first despite the rest of the repo being platform-neutral.

## Missing Setup Steps Not Captured Anywhere

- `python -m spacy download en_core_web_sm` is required before `app.py` can run (`spacy.load("en_core_web_sm")` will raise `OSError` otherwise) — not mentioned in `README.md`, `requirements.txt`, or `start.ps1`.
- The first run of `app.py` will download the `all-MiniLM-L6-v2` SBERT model (hundreds of MB) unless `HF_HUB_OFFLINE=1` and a pre-populated cache are provided — no size/bandwidth warning anywhere.
- `requirements.txt` has no version pins, so a fresh `pip install -r requirements.txt` is not reproducible.

See [[Known-Issues]] and [[Developer-Onboarding]].
