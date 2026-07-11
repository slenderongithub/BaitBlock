# Python Backend (Dormant)

Parent: [[System-Architecture]]

**File:** `app.py` (471 lines, single file)
**Entry point:** `python app.py` or `start.ps1` (Windows only)
**Stack:** Flask, spaCy (`en_core_web_sm`), sentence-transformers (`all-MiniLM-L6-v2`), scikit-learn, NLTK (VADER), TextBlob, newspaper3k, BeautifulSoup4, requests

## Why It's "Dormant"

```python
app = Flask(__name__, static_folder=".", static_url_path="")
...
@app.get("/")
def index():
    return send_from_directory(".", "index.html")
```

`static_folder="."` and `send_from_directory(".", "index.html")` both resolve relative to the repo root, where `app.py` lives — but `index.html` only exists under `public/`. **Visiting `/` on this server 404s.** The `/<path:filename>` catch-all has the same problem for `script.js`/`styles.css`. The fix (not applied — analysis only) would mirror `src/server.js`'s `PUBLIC_DIR = path.join(__dirname, "..", "public")` pattern.

## What It Does Internally (works fine as a callable, just unreachable via HTTP)

1. **Scraping** (`scrape_article`): tries `newspaper3k` first, falls back to BeautifulSoup4 if the headline is empty or body is too short.
2. **Preprocessing** (`preprocess_text`): spaCy lemmatization, stopword/punctuation removal.
3. **Semantic similarity** (`semantic_similarity`): SBERT embeddings (`all-MiniLM-L6-v2`) + scikit-learn cosine similarity; falls back to a deterministic hashed bag-of-words embedding (`local_embedding`) if the SBERT model can't load.
4. **Sentiment** (`headline_sentiment`): NLTK VADER, falls back to TextBlob polarity.
5. **NER** (`entity_highlights`, `grouped_entities`): real spaCy entities grouped by label (`ORG`, `PERSON`, `GPE`, `DATE`, `PRODUCT`, `MONEY`, `EVENT`, `NORP`) — richer than the Node backend's single "Proper Nouns" bucket.
6. **Scoring** (`compute_composite`): weighted composite of semantic-gap component, sentiment component, and lexical hook-pattern bonus, with a 4-way verdict (`Clickbait` / `Sensationalist` / `Borderline` / `Legitimate`) — more granular than Node's 3-way verdict.

## Undocumented Setup Requirements

- `python -m spacy download en_core_web_sm` — not run anywhere, not documented.
- First run downloads the SBERT model unless `.cache/huggingface` is pre-populated and `HF_HUB_OFFLINE=1` is set.
- `requirements.txt` has no version pins.

## Related

- [[System-Architecture]]
- [[Scoring-Algorithm]]
- [[Known-Issues]]
