import re
import os
import socket
import ipaddress
import hashlib
import math
import logging
import warnings
from collections import Counter
from functools import lru_cache
from typing import Dict, List, Tuple
from urllib.parse import urlparse

os.environ.setdefault("TRANSFORMERS_NO_TORCHVISION", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")

import nltk
import requests
import spacy
from bs4 import BeautifulSoup
from flask import Flask, jsonify, request, send_from_directory
from newspaper import Article, Config as NewspaperConfig
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from nltk.sentiment import SentimentIntensityAnalyzer
from textblob import TextBlob

APP_PORT = int(os.environ.get("PORT", "3000"))
SIMILARITY_GAP_THRESHOLD = 0.35
SENTIMENT_MAG_THRESHOLD = 0.5

# Directory holding the browser assets (index.html, script.js, styles.css).
# The original code pointed Flask at the repo root, where index.html does not
# exist, so the UI 404'd. It now correctly points at ./public.
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")

# Sentence-transformer model for semantic similarity. Upgraded default:
# all-mpnet-base-v2 (768-dim, much stronger STS than the old all-MiniLM-L6-v2).
# Override with CLICKBAIT_EMBEDDING_MODEL (e.g. BAAI/bge-small-en-v1.5).
EMBEDDING_MODEL = os.environ.get(
    "CLICKBAIT_EMBEDDING_MODEL", "sentence-transformers/all-mpnet-base-v2"
)

# Outbound-fetch safety (parity with the Node backend).
FETCH_TIMEOUT_SECONDS = int(os.environ.get("CLICKBAIT_FETCH_TIMEOUT_MS", "15000")) // 1000
FETCH_MAX_BYTES = int(os.environ.get("CLICKBAIT_FETCH_MAX_BYTES", str(5 * 1024 * 1024)))
ALLOW_PRIVATE = os.environ.get("CLICKBAIT_ALLOW_PRIVATE", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
ALLOWED_CONTENT_TYPES = {"text/html", "application/xhtml+xml"}
USER_AGENT = "Mozilla/5.0 (compatible; BaitBlock/1.0; +https://github.com/)"

MODEL_CACHE_DIR = os.environ.get(
    "CLICKBAIT_MODEL_CACHE", os.path.join(os.path.dirname(__file__), ".cache", "huggingface")
)
os.environ.setdefault("HF_HOME", MODEL_CACHE_DIR)
os.environ.setdefault("TRANSFORMERS_CACHE", MODEL_CACHE_DIR)
os.environ.setdefault("SENTENCE_TRANSFORMERS_HOME", MODEL_CACHE_DIR)
warnings.filterwarnings(
    "ignore",
    message=r"The Transformer `cache_dir` argument is deprecated.*",
)
for noisy_logger in ("transformers", "sentence_transformers", "huggingface_hub"):
    logging.getLogger(noisy_logger).setLevel(logging.ERROR)

app = Flask(__name__, static_folder=PUBLIC_DIR, static_url_path="")


def _is_public_ip(ip_str: str) -> bool:
    """True only for globally-routable unicast addresses."""
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def assert_url_allowed(url: str) -> None:
    """SSRF guard: reject non-http(s) and private/reserved destinations.

    Mirrors the Node ssrfGuard so both engines refuse to fetch internal hosts
    (localhost, RFC1918, the 169.254.169.254 metadata endpoint, etc.).
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Only http and https URLs are supported.")

    if ALLOW_PRIVATE:
        return

    host = (parsed.hostname or "").lower()
    if (
        host in {"localhost", "metadata.google.internal"}
        or host.endswith(".localhost")
        or host.endswith(".local")
    ):
        raise ValueError("Refusing to fetch an internal or reserved hostname.")

    host_is_ip = True
    try:
        ipaddress.ip_address(host)
    except ValueError:
        host_is_ip = False

    if host_is_ip:
        if not _is_public_ip(host):
            raise ValueError("Refusing to fetch a private or reserved address.")
        return

    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise ValueError("Could not resolve the host for that URL.") from exc

    for info in infos:
        address = info[4][0].split("%")[0]
        if not _is_public_ip(address):
            raise ValueError("Refusing to fetch a private or reserved address.")


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def safe_iso_date(value) -> str | None:
    if not value:
        return None
    try:
        return value.isoformat()
    except Exception:
        return None


@lru_cache(maxsize=1)
def get_nlp():
    return spacy.load("en_core_web_sm")


@lru_cache(maxsize=1)
def get_sbert_model():
    try:
        return SentenceTransformer(EMBEDDING_MODEL)
    except Exception:
        return None


@lru_cache(maxsize=1)
def get_sentiment_model():
    try:
        return SentimentIntensityAnalyzer()
    except LookupError:
        return None


def _newspaper_config() -> NewspaperConfig:
    cfg = NewspaperConfig()
    cfg.browser_user_agent = USER_AGENT
    cfg.request_timeout = FETCH_TIMEOUT_SECONDS
    cfg.fetch_images = False
    return cfg


def scrape_with_newspaper(url: str) -> Dict:
    article = Article(url, config=_newspaper_config())
    article.download()
    article.parse()
    return {
        "headline": normalize_whitespace(article.title),
        "body": normalize_whitespace(article.text),
        "authors": article.authors or [],
        "published_at": safe_iso_date(article.publish_date),
        "meta_description": normalize_whitespace(getattr(article, "meta_description", "") or ""),
        "extraction_method": "newspaper3k",
    }


def scrape_with_bs4(url: str) -> Dict:
    # TLS verification is intentionally left ON. The original code silently
    # retried with verify=False on SSLError, which defeats transport security.
    response = requests.get(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
        },
        timeout=FETCH_TIMEOUT_SECONDS,
        stream=True,
    )
    response.raise_for_status()

    content_type = response.headers.get("Content-Type", "").split(";")[0].strip().lower()
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError("That URL doesn't appear to be an HTML article.")

    # Read the body with a hard size cap instead of trusting Content-Length.
    chunks: List[bytes] = []
    total = 0
    for chunk in response.iter_content(chunk_size=8192):
        total += len(chunk)
        if total > FETCH_MAX_BYTES:
            response.close()
            raise ValueError("The article page is too large to analyze.")
        chunks.append(chunk)

    soup = BeautifulSoup(b"".join(chunks), "html.parser")

    title = ""
    og_title = soup.find("meta", property="og:title")
    if og_title and og_title.get("content"):
        title = og_title["content"]
    if not title and soup.title:
        title = soup.title.get_text(" ", strip=True)
    if not title:
        h1 = soup.find("h1")
        if h1:
            title = h1.get_text(" ", strip=True)

    body_parts: List[str] = []
    for selector in ["article", "main", "[role='main']", ".post-content", ".entry-content"]:
        selected = soup.select(selector)
        if selected:
            for block in selected:
                body_parts.append(block.get_text(" ", strip=True))
            break

    if not body_parts:
        paragraphs = soup.find_all("p")
        body_parts = [p.get_text(" ", strip=True) for p in paragraphs]

    author = ""
    author_meta = soup.find("meta", attrs={"name": "author"})
    if author_meta and author_meta.get("content"):
        author = normalize_whitespace(author_meta.get("content"))

    published = None
    published_meta = soup.find("meta", property="article:published_time")
    if published_meta and published_meta.get("content"):
        published = normalize_whitespace(published_meta.get("content"))

    description = ""
    desc_meta = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", property="og:description")
    if desc_meta and desc_meta.get("content"):
        description = normalize_whitespace(desc_meta.get("content"))

    body_text = normalize_whitespace(" ".join(body_parts))
    return {
        "headline": normalize_whitespace(title),
        "body": body_text,
        "authors": [author] if author else [],
        "published_at": published,
        "meta_description": description,
        "extraction_method": "beautifulsoup",
    }


def scrape_article(url: str) -> Dict:
    try:
        article = scrape_with_newspaper(url)
        if article["headline"] and len(article["body"]) > 180:
            return article
    except Exception:
        pass

    return scrape_with_bs4(url)


def preprocess_text(text: str) -> str:
    nlp = get_nlp()
    doc = nlp(normalize_whitespace(text))
    tokens = [
        token.lemma_.lower()
        for token in doc
        if not token.is_stop and not token.is_punct and not token.is_space
    ]
    return normalize_whitespace(" ".join(tokens))


def local_embedding(text: str, dimensions: int = 384) -> List[float]:
    vector = [0.0] * dimensions
    tokens = preprocess_text(text).split()
    if not tokens:
        return vector

    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimensions
        weight = 1.0 + (int.from_bytes(digest[4:8], "big") % 1000) / 1000.0
        vector[index] += weight

    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0.0:
        return vector
    return [value / norm for value in vector]


def semantic_similarity(headline: str, body: str) -> float:
    model = get_sbert_model()

    body_for_embedding = body[:6000] if body else ""
    h_text = preprocess_text(headline) or headline
    b_text = preprocess_text(body_for_embedding) or body_for_embedding

    if model is not None:
        embeddings = model.encode([h_text, b_text], convert_to_numpy=True)
        similarity = float(cosine_similarity([embeddings[0]], [embeddings[1]])[0][0])
    else:
        headline_embedding = local_embedding(h_text)
        body_embedding = local_embedding(b_text)
        similarity = float(cosine_similarity([headline_embedding], [body_embedding])[0][0])

    return max(-1.0, min(1.0, similarity))


def headline_sentiment(headline: str) -> float:
    analyzer = get_sentiment_model()
    if analyzer is not None:
        scores = analyzer.polarity_scores(headline)
        return float(scores.get("compound", 0.0))

    # Fallback path when VADER resources cannot be downloaded in restricted environments.
    return float(TextBlob(headline).sentiment.polarity)


def lexical_hook_score(headline: str) -> Tuple[float, List[str]]:
    patterns = [
        (r"you won't believe|won't believe", "Suspense bait phrase in headline."),
        (r"shocking|mind.?blowing|unbelievable", "Extreme emotional adjective detected."),
        (r"secret|exposed|truth about", "Curiosity-gap wording detected."),
        (r"\b(top|best|worst)\s+\d+\b|\b\d+\s+reasons\b", "Listicle hype pattern detected."),
        (r"!{1,}|\?{1,}", "Emphatic punctuation suggests sensational framing."),
    ]

    score = 0.0
    signals: List[str] = []
    for pattern, reason in patterns:
        if re.search(pattern, headline, flags=re.IGNORECASE):
            score += 0.12
            signals.append(reason)

    score = min(score, 0.35)
    return score, signals


def key_phrases_from_body(body: str, limit: int = 8) -> List[str]:
    tokens = [
        token
        for token in preprocess_text(body[:6000]).split()
        if len(token) >= 4 and token.isalpha()
    ]
    counts = Counter(tokens)
    return [token for token, _ in counts.most_common(limit)]


def entity_highlights(body: str, limit: int = 6) -> List[str]:
    nlp = get_nlp()
    doc = nlp(body[:5000])
    scored = []
    for ent in doc.ents:
        text = normalize_whitespace(ent.text)
        if len(text) < 3:
            continue
        scored.append(f"{text} ({ent.label_})")
    return list(dict.fromkeys(scored))[:limit]


def grouped_entities(body: str, limit_per_group: int = 6) -> Dict[str, List[str]]:
    nlp = get_nlp()
    doc = nlp(body[:5000])
    group_order = ["ORG", "PERSON", "GPE", "DATE", "PRODUCT", "MONEY", "EVENT", "NORP"]
    groups: Dict[str, List[str]] = {label: [] for label in group_order}

    for ent in doc.ents:
        label = ent.label_
        text = normalize_whitespace(ent.text)
        if label not in groups or len(text) < 3:
            continue
        if text not in groups[label]:
            groups[label].append(text)

    return {label: values[:limit_per_group] for label, values in groups.items() if values}


def supporting_sentences(headline: str, body: str, limit: int = 3) -> List[str]:
    nlp = get_nlp()
    doc = nlp(body[:5000])
    headline_terms = set(preprocess_text(headline).split())
    scored: List[Tuple[float, str]] = []

    for sent in doc.sents:
        sentence_text = normalize_whitespace(sent.text)
        if len(sentence_text) < 30:
            continue
        sentence_terms = set(preprocess_text(sentence_text).split())
        overlap = len(headline_terms & sentence_terms)
        score = overlap + min(2.0, len(sentence_text) / 160.0)
        scored.append((score, sentence_text))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [sentence for _, sentence in scored[:limit]]


def compute_composite(similarity: float, polarity: float, headline: str) -> Tuple[int, str, List[str], bool, bool, Dict]:
    signals: List[str] = []

    semantic_gap = similarity < SIMILARITY_GAP_THRESHOLD
    sensational_tone = abs(polarity) > SENTIMENT_MAG_THRESHOLD

    if semantic_gap:
        signals.append(
            f"Semantic gap detected: cosine similarity {similarity:.3f} is below {SIMILARITY_GAP_THRESHOLD:.2f}."
        )

    if sensational_tone:
        signals.append(
            f"Strong headline sentiment: polarity {polarity:.3f} exceeds +/-{SENTIMENT_MAG_THRESHOLD:.2f}."
        )

    hook_bonus, hook_signals = lexical_hook_score(headline)
    signals.extend(hook_signals)

    gap_component = 0.0
    if semantic_gap:
        gap_component = min(1.0, (SIMILARITY_GAP_THRESHOLD - similarity) / max(SIMILARITY_GAP_THRESHOLD, 1e-6))

    sentiment_component = min(1.0, abs(polarity))

    composite = (
        gap_component * 58
        + sentiment_component * 28
        + hook_bonus * 40
        + (8 if semantic_gap and sensational_tone else 0)
    )

    score = int(max(0, min(100, round(composite))))

    if semantic_gap and sensational_tone and score >= 65:
        verdict = "Clickbait"
    elif sensational_tone and score >= 45:
        verdict = "Sensationalist"
    elif score >= 35 or semantic_gap:
        verdict = "Borderline"
    else:
        verdict = "Legitimate"

    breakdown = {
        "semantic_gap_points": round(gap_component * 58, 1),
        "sentiment_points": round(sentiment_component * 28, 1),
        "hook_points": round(hook_bonus * 40, 1),
        "synergy_points": 8 if semantic_gap and sensational_tone else 0,
    }

    return score, verdict, signals[:8], semantic_gap, sensational_tone, breakdown


def build_summary(verdict: str, score: int) -> str:
    if verdict == "Clickbait":
        return f"High risk of clickbait/deceptive framing (score {score}/100)."
    if verdict == "Sensationalist":
        return f"Headline appears emotionally exaggerated (score {score}/100)."
    if verdict == "Borderline":
        return f"Mixed signals detected. Review article context carefully (score {score}/100)."
    return f"Headline/body alignment appears mostly legitimate (score {score}/100)."


def analyze_article(url: str) -> Dict:
    parsed = requests.utils.urlparse(url)
    # SSRF guard runs before any fetch (raises ValueError -> 400).
    assert_url_allowed(url)

    article = scrape_article(url)
    headline = article.get("headline") or ""
    body = article.get("body") or ""

    headline_extracted = bool(headline)
    if not headline:
        fallback = parsed.netloc.replace("www.", "").strip() or "source"
        headline = f"Article from {fallback}"

    if not body or len(body) < 80:
        raise ValueError("Could not extract enough article body text.")

    similarity = semantic_similarity(headline, body)
    polarity = headline_sentiment(headline)

    score, verdict, signals, semantic_gap, sensational_tone, score_breakdown = compute_composite(
        similarity,
        polarity,
        headline,
    )

    word_count = len(re.findall(r"\w+", body))
    read_time_minutes = max(1, round(word_count / 220))
    headline_word_count = len(re.findall(r"\w+", headline))
    numeric_claim_count = len(re.findall(r"\b\d+(?:[.,]\d+)?\b", headline + " " + body[:1800]))

    phrases = key_phrases_from_body(body)
    entities = entity_highlights(body)

    source_domain = parsed.netloc.replace("www.", "")
    authors = article.get("authors") or []
    published_at = article.get("published_at")
    meta_description = article.get("meta_description") or ""
    extraction_method = article.get("extraction_method") or "unknown"

    return {
        "url": url,
        "engine": f"python-nlp ({EMBEDDING_MODEL.split('/')[-1]})",
        "headline": headline,
        "headline_extracted": headline_extracted,
        "body_snippet": normalize_whitespace(body)[:420] + ("..." if len(body) > 420 else ""),
        "source_domain": source_domain,
        "authors": authors,
        "published_at": published_at,
        "meta_description": meta_description,
        "extraction_method": extraction_method,
        "word_count": word_count,
        "headline_word_count": headline_word_count,
        "estimated_read_time_minutes": read_time_minutes,
        "numeric_claim_count": numeric_claim_count,
        "key_phrases": phrases,
        "named_entities": entities,
        "entity_groups": grouped_entities(body),
        "supporting_sentences": supporting_sentences(headline, body),
        "cosine_similarity_score": round(similarity, 4),
        "sentiment_polarity": round(polarity, 4),
        "composite_sensationalism_score": score,
        "legitimacy_confidence_score": 100 - score,
        "semantic_gap": semantic_gap,
        "sensational_tone": sensational_tone,
        "score_breakdown": score_breakdown,
        "verdict": verdict,
        "summary": build_summary(verdict, score),
        "signals": signals,
    }


@app.post("/api/analyze")
def analyze_route():
    payload = request.get_json(silent=True) or {}
    url = (payload.get("url") or "").strip()

    if not url:
        return jsonify({"error": "Please provide a valid URL."}), 400

    try:
        result = analyze_article(url)
        return jsonify(result)
    except ValueError as err:
        return jsonify({"error": str(err)}), 400
    except Exception as err:
        return jsonify({"error": "Analysis failed.", "detail": str(err)}), 500


@app.get("/")
def index():
    return send_from_directory(PUBLIC_DIR, "index.html")


@app.get("/healthz")
def healthz():
    return jsonify({"status": "ok"})


# Static assets (styles.css, script.js, theme.js, robots.txt) are served
# automatically by Flask from PUBLIC_DIR because static_url_path="". Any other
# unmatched path falls back to the single-page app.
@app.errorhandler(404)
def spa_fallback(_error):
    return send_from_directory(PUBLIC_DIR, "index.html"), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=APP_PORT, debug=False)
