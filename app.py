import re
import os
import json
import time
import socket
import threading
import ipaddress
import hashlib
import math
import logging
import warnings
from collections import Counter, deque
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
USER_AGENT = os.environ.get(
    "CLICKBAIT_USER_AGENT",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
)
FETCH_MAX_REDIRECTS = int(os.environ.get("CLICKBAIT_FETCH_MAX_REDIRECTS", "5"))
RATE_WINDOW_SECONDS = int(os.environ.get("CLICKBAIT_RATE_WINDOW_MS", "60000")) / 1000
RATE_MAX = int(os.environ.get("CLICKBAIT_RATE_MAX", "20"))
MAX_CONCURRENT = int(os.environ.get("CLICKBAIT_MAX_CONCURRENT", "4"))
MAX_URL_LENGTH = 2048

# Shared with the Node engine: signal rules + the learned headline model.
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src", "data")
with open(os.path.join(DATA_DIR, "rules.json"), encoding="utf-8") as fh:
    RULES = json.load(fh)
try:
    with open(os.path.join(DATA_DIR, "headline-model.json"), encoding="utf-8") as fh:
        HEADLINE_MODEL = json.load(fh)
except OSError:
    HEADLINE_MODEL = None

# Scoring constants: keep in sync with src/config.js `scoring`.
SATURATION = 50
DEAD_ZONE = 15
TIERS = [20, 40, 60, 80]
MODEL_FLOOR = 0.35
MODEL_MAX_POINTS = 70
ALIGNMENT_OK = 0.6
MIN_BODY_WORDS = 80

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
app.config["MAX_CONTENT_LENGTH"] = 4096  # bodies are a single {"url": ...}
security_logger = logging.getLogger("baitblock.security")


class SsrfBlocked(ValueError):
    """A URL rejected by the SSRF policy (logged as a security event)."""


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
        raise SsrfBlocked("Refusing to fetch an internal or reserved hostname.")

    host_is_ip = True
    try:
        ipaddress.ip_address(host)
    except ValueError:
        host_is_ip = False

    if host_is_ip:
        if not _is_public_ip(host):
            raise SsrfBlocked("Refusing to fetch a private or reserved address.")
        return

    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise ValueError("Could not resolve the host for that URL.") from exc

    for info in infos:
        address = info[4][0].split("%")[0]
        if not _is_public_ip(address):
            raise SsrfBlocked("Refusing to fetch a private or reserved address.")


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


# --------------------------------------------------------------------------
# Fetching: ONE guarded download. Redirects are followed manually so every hop
# is re-validated against the SSRF policy (requests/newspaper would otherwise
# follow a public URL's 302 to an internal address). Residual: DNS rebinding
# between validation and connect is not pinned here (the Node engine pins it).
# --------------------------------------------------------------------------


def safe_get(url: str) -> Tuple[str, str]:
    current = url
    for _ in range(FETCH_MAX_REDIRECTS + 1):
        assert_url_allowed(current)
        response = requests.get(
            current,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9",
            },
            timeout=FETCH_TIMEOUT_SECONDS,
            stream=True,
            allow_redirects=False,
        )
        if response.is_redirect:
            location = response.headers.get("Location")
            response.close()
            if not location:
                raise ValueError("The article redirected without a destination.")
            current = requests.compat.urljoin(current, location)
            continue
        if response.status_code in (401, 403):
            raise ValueError(f"The site blocked our request (HTTP {response.status_code}).")
        response.raise_for_status()

        content_type = response.headers.get("Content-Type", "").split(";")[0].strip().lower()
        if content_type and content_type not in ALLOWED_CONTENT_TYPES:
            raise ValueError("That URL doesn't appear to be an HTML article.")

        chunks: List[bytes] = []
        total = 0
        for chunk in response.iter_content(chunk_size=8192):
            total += len(chunk)
            if total > FETCH_MAX_BYTES:
                response.close()
                raise ValueError("The article page is too large to analyze.")
            chunks.append(chunk)
        encoding = response.encoding or "utf-8"
        return b"".join(chunks).decode(encoding, errors="replace"), current
    raise ValueError("The article redirected too many times.")


def _meta(soup, **attrs) -> str:
    tag = soup.find("meta", attrs=attrs)
    return normalize_whitespace(tag.get("content", "")) if tag else ""


def _json_ld_nodes(soup) -> List[Dict]:
    nodes: List[Dict] = []
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            parsed = json.loads(script.string or "")
        except (ValueError, TypeError):
            continue
        queue = parsed if isinstance(parsed, list) else [parsed]
        while queue:
            node = queue.pop(0)
            if isinstance(node, dict):
                nodes.append(node)
                queue.extend(n for n in node.get("@graph", []) if isinstance(n, dict))
    return nodes


def page_metadata(soup) -> Dict:
    nodes = _json_ld_nodes(soup)
    types = [
        " ".join(t) if isinstance(t, list) else str(t)
        for t in (n.get("@type", "") for n in nodes)
        if re.search(r"article|posting|report", " ".join(t) if isinstance(t, list) else str(t), re.I)
    ]
    site_name = _meta(soup, property="og:site_name") or _meta(soup, name="application-name")
    if not site_name:
        for node in nodes:
            pub = node.get("publisher")
            if isinstance(pub, dict) and pub.get("name"):
                site_name = normalize_whitespace(pub["name"])
                break
    labels = [
        v
        for v in (
            _meta(soup, property="article:section"),
            _meta(soup, name="parsely-section"),
            _meta(soup, property="article:content_tier"),
        )
        if v
    ]
    return {
        "site_name": site_name,
        "article_type": types[0] if types else _meta(soup, property="og:type"),
        "labels": labels,
    }


def scrape_with_bs4(soup) -> Dict:
    title = _meta(soup, property="og:title") or (soup.title.get_text(" ", strip=True) if soup.title else "")
    if not title and soup.find("h1"):
        title = soup.find("h1").get_text(" ", strip=True)

    body_parts: List[str] = []
    for selector in ["article", "main", "[role='main']", ".post-content", ".entry-content"]:
        selected = soup.select(selector)
        if selected:
            body_parts = [p.get_text(" ", strip=True) for block in selected for p in block.find_all("p")]
            break
    if not body_parts:
        body_parts = [p.get_text(" ", strip=True) for p in soup.find_all("p")]

    author = _meta(soup, name="author")
    return {
        "headline": normalize_whitespace(title),
        "body": normalize_whitespace(" ".join(body_parts)),
        "authors": [author] if author else [],
        "published_at": _meta(soup, property="article:published_time") or None,
        "meta_description": _meta(soup, name="description") or _meta(soup, property="og:description"),
        "extraction_method": "beautifulsoup",
    }


BLOCK_TAGS = ["p", "div", "li", "blockquote", "section", "td", "h2", "h3", "h4"]
SKIP_TAGS = ["script", "style", "noscript", "nav", "footer", "header", "aside", "form", "button", "svg", "figcaption"]


def text_blocks(html: str) -> str:
    """Innermost text blocks in document order, whatever the tag.

    Catches sites whose paragraphs are <div>/<span> (BuzzFeed, many Next.js
    CMSes) that newspaper3k and the <p> scan miss. A block counts when it has
    no block-level children and reads like prose (>= 60 chars, sentence punctuation).
    """
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(SKIP_TAGS):
        tag.decompose()
    out = []
    for el in soup.find_all(BLOCK_TAGS):
        if el.find(BLOCK_TAGS):
            continue
        text = normalize_whitespace(el.get_text(" ", strip=True))
        if len(text) >= 60 and re.search(r"[.!?\"\u201d]", text):
            out.append(text if re.search(r"[.!?:;\"\u201d')]$", text) else text + ".")
    return " ".join(out)


def scrape_article(url: str) -> Dict:
    html, final_url = safe_get(url)
    soup = BeautifulSoup(html, "html.parser")
    article = None
    try:
        parsed = Article(final_url, config=_newspaper_config())
        parsed.download(input_html=html)  # parse our guarded copy; no second fetch
        parsed.parse()
        article = {
            "headline": normalize_whitespace(parsed.title),
            "body": normalize_whitespace(parsed.text),
            "authors": parsed.authors or [],
            "published_at": safe_iso_date(parsed.publish_date),
            "meta_description": normalize_whitespace(getattr(parsed, "meta_description", "") or ""),
            "extraction_method": "newspaper3k",
        }
    except Exception:
        article = None
    fallback = scrape_with_bs4(soup)
    if not article or not article["headline"] or len(article["body"]) <= 180:
        article = {**fallback, "headline": (article or {}).get("headline") or fallback["headline"]}
    # Keep the cleaner extractor unless the generic block scan found far more text.
    blocks = text_blocks(html)
    if len(blocks.split()) > 1.4 * len(article["body"].split()):
        article["body"] = blocks
        article["extraction_method"] = "text-block scan"
    # Same headline precedence as the Node engine (og:title -> twitter:title ->
    # h1 -> <title>): the social title is the one people click on in feeds.
    h1 = soup.find("h1")
    article["headline"] = normalize_whitespace(
        _meta(soup, property="og:title")
        or _meta(soup, name="twitter:title")
        or (h1.get_text(" ", strip=True) if h1 else "")
        or article["headline"]
    )
    article.update(page_metadata(soup))
    article["final_url"] = final_url
    return article


# --------------------------------------------------------------------------
# Text helpers (mirror src/textUtils.js and src/headlineModel.js)
# --------------------------------------------------------------------------

STOP_WORDS = set(RULES["stop_words"])
PATTERNS = [{**p, "regex": re.compile(p["re"], re.I)} for p in RULES["patterns"]]
LEX = {k: re.compile(v, re.I) for k, v in RULES["lexicons"].items()}
QUOTE_RE = re.compile(r'["“][^"”]{20,}["”]')
SATIRE = set(RULES["satire_domains"])
DIM_RULES = {d["key"]: d for d in RULES["dimensions"]}
TIER_INFO = [
    ("minimal", "safe", "Straight Reporting"),
    ("low", "safe", "Likely Legit"),
    ("moderate", "warning", "Borderline"),
    ("high", "risky", None),
    ("severe", "risky", None),
]
SUMMARY_LEAD = {
    "minimal": "Low risk: the headline and article read like straight reporting.",
    "low": "Mostly sound, with minor warning signs.",
    "moderate": "Mixed signals: read critically before trusting the framing.",
    "high": "High risk of misleading or manipulative framing.",
    "severe": "Severe risk: several strong deception signals stack up.",
}


def get_tokens(text: str) -> List[str]:
    return re.sub(r"[^a-z0-9\s]", " ", (text or "").lower()).split()


def stem(word: str) -> str:
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    for suffix in ("ing", "edly", "ed", "ly", "es", "s"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            return word[: -len(suffix)]
    return word


def content_stems(text: str) -> set:
    return {stem(t) for t in get_tokens(text) if len(t) > 2 and t not in STOP_WORDS}


def share(needles: set, haystack: set) -> float:
    return len(needles & haystack) / len(needles) if needles else 0.0


def find_all(regex, text: str) -> List[str]:
    return [m.group(0) for m in regex.finditer(text or "")]


def headline_features(text: str) -> List[str]:
    norm = (text or "").lower().replace("‘", "'").replace("’", "'")
    norm = norm.replace("“", '"').replace("”", '"')
    toks = [t.strip("'") for t in re.findall(r"[a-z0-9']+|[?!]", norm)]
    toks = ["<num>" if t[:1].isdigit() else t for t in toks if t]
    feats = set(toks)
    feats.update(f"{a} {b}" for a, b in zip(toks, toks[1:]))
    if toks:
        feats.add("^" + toks[0])
    feats.add("len:short" if len(toks) < 6 else "len:long" if len(toks) > 14 else "len:mid")
    return list(feats)


def predict_headline(text: str):
    if not HEADLINE_MODEL or not text:
        return None
    weights = HEADLINE_MODEL["weights"]
    z = HEADLINE_MODEL["bias"]
    hits = []
    for f in headline_features(text):
        w = weights.get(f)
        if w is None:
            continue
        z += w
        if not f.startswith("len:"):
            hits.append((f.lstrip("^"), w))
    hits.sort(key=lambda h: -h[1])
    terms = list(dict.fromkeys(t for t, w in hits if w > 0.4))[:6]
    return {"probability": 1 / (1 + math.exp(-z)), "terms": terms}


def loaded_intensity(tokens: List[str]) -> Tuple[int, List[str]]:
    hits = [t for t in tokens if RULES["loaded_words"].get(t)]
    return sum(RULES["loaded_words"][t] for t in hits), hits


def registrable_domain(host: str) -> str:
    parts = host.split(".")
    n = 3 if len(parts) >= 3 and len(parts[-1]) == 2 and parts[-2] in {"co", "com", "net", "org", "gov", "ac", "edu"} else 2
    return ".".join(parts[-n:])


def impersonated_outlet(hostname: str):
    host = (hostname or "").lower()
    host = host[4:] if host.startswith("www.") else host
    reg = registrable_domain(host)
    official = [d for ds in RULES["brand_domains"].values() for d in ds]
    if reg in official:
        return None
    label = reg.split(".")[0]
    for brand, domains in RULES["brand_domains"].items():
        for d in domains:
            if host.startswith(d + ".") or f".{d}." in host:
                return d
        if label.startswith(brand + "-"):
            return domains[0]
    return None


# --------------------------------------------------------------------------
# Embeddings (fallback hashing embedder when the SBERT model is unavailable)
# --------------------------------------------------------------------------


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


def semantic_similarity(headline: str, passage: str) -> float:
    """Cosine similarity of raw headline vs passage (SBERT models want natural text)."""
    model = get_sbert_model()
    passage = passage[:3000]
    if model is not None:
        embeddings = model.encode([headline, passage], convert_to_numpy=True)
        similarity = float(cosine_similarity([embeddings[0]], [embeddings[1]])[0][0])
    else:
        similarity = float(cosine_similarity([local_embedding(headline)], [local_embedding(passage)])[0][0])
    return max(-1.0, min(1.0, similarity))


def headline_sentiment(headline: str) -> float:
    analyzer = get_sentiment_model()
    if analyzer is not None:
        return float(analyzer.polarity_scores(headline).get("compound", 0.0))
    # Fallback path when VADER resources cannot be downloaded in restricted environments.
    return float(TextBlob(headline).sentiment.polarity)


# --------------------------------------------------------------------------
# The six-dimension risk engine (mirrors src/scoring.js; this engine adds SBERT
# to the headline-vs-body check and uses spaCy NER for entity grounding).
# --------------------------------------------------------------------------


class Dimensions:
    def __init__(self):
        self.points = {d["key"]: 0.0 for d in RULES["dimensions"]}
        self.signals = {d["key"]: [] for d in RULES["dimensions"]}

    def add(self, key: str, points: float, text: str) -> None:
        if points < 1:
            return
        self.points[key] += points
        self.signals[key].append({"text": text, "points": round(points)})


def score_headline(title: str, dims: Dimensions, highlights: List[str]) -> None:
    model = predict_headline(title)
    if model:
        pts = max(0.0, model["probability"] - MODEL_FLOOR) / (1 - MODEL_FLOOR) * MODEL_MAX_POINTS
        dims.add("bait", pts, f"Headline style is {round(model['probability'] * 100)}% similar to known clickbait headlines.")
        if model["probability"] >= 0.5:
            highlights.extend(t for t in model["terms"] if "<" not in t)

    for p in (p for p in PATTERNS if p["scope"] == "headline"):
        found = find_all(p["regex"], title)
        if found:
            n = min(len(found), p.get("max", 1))
            dims.add(p["dim"], p["weight"] * n, f'{p["label"]}: "' + '", "'.join(found[:n]) + '"')
            highlights.extend(found)

    tokens = get_tokens(title)
    total, hits = loaded_intensity(tokens)
    if total:
        quoted, _ = loaded_intensity(get_tokens(" ".join(re.findall(r"[\"'‘“][^\"'’”]+", title))))
        dims.add("sensational", min(40, (total - quoted / 2) * 6), f"Loaded words: {', '.join(hits)}" + (" (partly quoted)" if quoted else ""))
        highlights.extend(hits)
    intensifiers = find_all(LEX["intensifier"], title)
    if intensifiers:
        dims.add("sensational", len(intensifiers) * 4, f"Intensifiers: {', '.join(intensifiers)}")

    bangs = title.count("!")
    if bangs:
        dims.add("sensational", min(16, bangs * 8), "Exclamation marks in the headline.")
    caps_words = len(re.findall(r"\b[A-Z]{5,}\b", title))
    letters = re.sub(r"[^A-Za-z]", "", title)
    upper_ratio = len(re.sub(r"[^A-Z]", "", title)) / len(letters) if letters else 0
    if upper_ratio > 0.45 and len(title) > 16:
        dims.add("sensational", 15, "Headline is written mostly in capitals.")
    elif caps_words:
        dims.add("sensational", min(20, 6 + caps_words * 5), "ALL-CAPS words for emphasis.")
    if any(0x1F300 <= ord(c) <= 0x1FAFF or 0x2600 <= ord(c) <= 0x27BF for c in title):
        dims.add("sensational", 6, "Emoji in the headline.")
    if title.rstrip().endswith("?"):
        dims.add("bait", 6, "Headline is posed as a question.")
    if tokens and (len(tokens) < 4 or len(tokens) > 22):
        dims.add("bait", 5, f"Unusual headline length ({len(tokens)} words).")


def score_body_tone(body: str, words: int, dims: Dimensions) -> float:
    if words < MIN_BODY_WORDS:
        return 0.0
    per100 = words / 100
    density = loaded_intensity(get_tokens(body))[0] / per100
    if density > 0.8:
        dims.add("sensational", min(25, (density - 0.8) * 10), f"Body leans on loaded language ({density:.1f} intensity per 100 words).")
    if body.count("!") / per100 > 0.5:
        dims.add("sensational", 10, "Body is full of exclamation marks.")
    return density


def score_consistency(title: str, body: str, sentences: List[str], dims: Dimensions, strengths: List[str]):
    H = content_stems(title)
    if not H or not sentences:
        return None, None
    sent_stems = [content_stems(s) for s in sentences]
    full = share(H, set().union(*sent_stems))
    lead = share(H, set().union(*sent_stems[:3]))
    best = max(share(H, a | b) for a, b in zip(sent_stems, sent_stems[1:] + [set()]))
    lexical = 0.4 * full + 0.3 * lead + 0.3 * best

    # SBERT catches paraphrased headlines that share few exact words.
    cosine = semantic_similarity(title, " ".join(sentences[:5]))
    semantic = max(0.0, min(1.0, (cosine - 0.15) / 0.45))
    alignment = max(lexical, (lexical + semantic) / 2)

    if alignment < ALIGNMENT_OK:
        reliability = min(1.0, len(H) / 3)
        dims.add(
            "consistency",
            (ALIGNMENT_OK - alignment) / ALIGNMENT_OK * 55 * reliability,
            f"Only {round(full * 100)}% of the headline's key terms appear in the article ({round(lead * 100)}% in the opening); semantic match {cosine:.2f}.",
        )
    else:
        strengths.append(f"The article's opening addresses the headline (semantic match {cosine:.2f}).")

    num = lambda text: [n.replace(",", "") for n in re.findall(r"\d[\d,]*(?:\.\d+)?", text)]
    body_numbers = set(num(body))
    missing = [n for n in num(title) if not re.fullmatch(r"(19|20)\d\d", n) and n not in body_numbers]
    if missing:
        quoted = ", ".join(f'"{n}"' for n in missing)
        dims.add("consistency", min(2, len(missing)) * 20, f"Headline figure(s) {quoted} never appear in the article.")

    body_lower = body.lower()
    names = [
        e.text
        for e in get_nlp()(title).ents
        if e.label_ in {"PERSON", "ORG", "GPE", "LOC", "NORP"}
        and not any(len(t) > 2 and t in body_lower for t in get_tokens(e.text))
    ]
    if names:
        dims.add("consistency", min(2, len(names)) * 16, f"Named in the headline but absent from the body: {', '.join(names[:2])}.")

    claims = find_all(LEX["overclaim"], title)
    hedges = find_all(LEX["hedge"], body)
    if claims and len(hedges) >= 2:
        sample = '", "'.join(list(dict.fromkeys(h.lower() for h in hedges))[:3])
        dims.add("consistency", min(45, 25 + len(hedges) * 3), f'Headline states it as certain ("{claims[0]}") while the article hedges {len(hedges)} times ("{sample}").')
    return alignment, cosine


def score_sourcing(body: str, words: int, dims: Dimensions, strengths: List[str]) -> Dict:
    if words < MIN_BODY_WORDS:
        dims.add("sourcing", 20, f"The article body is very thin ({words} words), so claims can't be checked.")
        return {}
    m = {
        "attributions": len(find_all(LEX["attribution"], body)),
        "quotes": len(QUOTE_RE.findall(body)),
        "anonymous": len(find_all(LEX["anonymous"], body)),
        "rumor": len(find_all(LEX["rumor"], body)),
        "evidence": len(find_all(LEX["evidence"], body)),
    }
    rate = m["attributions"] / (words / 100)
    if words < 150:
        dims.add("sourcing", 12, f"Short article ({words} words) with little room for evidence.")
    if words >= 150 and rate < 0.25:
        dims.add("sourcing", 30, 'Almost no statements are attributed to anyone ("said", "according to").')
    elif words >= 150 and rate < 0.6:
        dims.add("sourcing", 14, f"Few attributed statements ({m['attributions']} in {words} words).")
    if m["quotes"] == 0 and words >= 250:
        dims.add("sourcing", 8, "No direct quotes from anyone involved.")
    if m["anonymous"] >= 2 and m["anonymous"] * 2 >= m["attributions"]:
        dims.add("sourcing", min(30, 10 + m["anonymous"] * 6), f'Leans on vague or anonymous sources ("sources say", "experts warn"): {m["anonymous"]} mentions.')
    if m["rumor"] >= 2:
        dims.add("sourcing", min(24, m["rumor"] * 6), f'Rumor / unverified wording ("reportedly", "allegedly"): {m["rumor"]} times.')
    if m["evidence"] == 0 and m["attributions"] < 3 and words >= 250:
        dims.add("sourcing", 10, "No reference to data, studies, documents or official figures.")
    if m["attributions"] >= 3:
        strengths.append(f"{m['attributions']} attributed statements.")
    if m["quotes"] >= 2:
        strengths.append(f"{m['quotes']} direct quotes.")
    if m["evidence"] >= 2:
        strengths.append(f"Cites data, studies or documents ({m['evidence']} references).")
    return m


def score_transparency(meta: Dict, body: str, dims: Dimensions, strengths: List[str], labels: List[Dict]) -> bool:
    host = (meta.get("hostname") or "").lower()
    host = host[4:] if host.startswith("www.") else host
    if not meta.get("title"):
        dims.add("transparency", 15, "No headline could be extracted from the page.")
    if not meta.get("authors"):
        dims.add("transparency", 25, "No byline: the author is not identified.")
    if not meta.get("published_at"):
        dims.add("transparency", 20, "No publication date found.")
    if not meta.get("site_name"):
        dims.add("transparency", 6, "Publisher name isn't declared in the page metadata.")
    if meta.get("scheme") == "http":
        dims.add("transparency", 10, "Page is served over unencrypted HTTP.")
    if meta.get("authors") and meta.get("published_at"):
        strengths.append("Byline and publication date are present.")

    article_type = meta.get("article_type") or ""
    label_text = f"{article_type} {' '.join(meta.get('labels') or [])} {meta.get('path', '')}"
    opening = body[:400]
    if find_all(LEX["sponsored"], f"{label_text} {opening}"):
        dims.add("transparency", 20, "Marked as sponsored / paid content.")
        labels.append({"label": "Sponsored", "detail": "Paid or partner content, not independent reporting."})
    if re.search(r"opinion|editorial", article_type, re.I) or find_all(LEX["opinion"], label_text):
        labels.append({"label": "Opinion", "detail": "Opinion piece: arguments, not straight news."})
    if find_all(LEX["press_release"], f"{label_text} {opening}"):
        labels.append({"label": "Press release", "detail": "Written by the subject itself, not a newsroom."})
    if re.search(r"liveblog", article_type, re.I) or re.search(r"/(live|live-updates|live-news)/", meta.get("path") or "", re.I):
        labels.append({"label": "Live blog", "detail": "Rolling updates: the headline may describe only the latest entry."})
    if re.search(r"video", article_type, re.I) or re.search(r"/videos?/", meta.get("path") or "", re.I):
        labels.append({"label": "Video page", "detail": "Mostly video; the text analyzed is only the page's description."})
    satire = registrable_domain(host) in SATIRE or bool(re.search(r"satiric", article_type, re.I))
    if satire:
        labels.append({"label": "Satire", "detail": "This outlet publishes satire. It is not meant as news."})
    try:
        from datetime import datetime, timezone

        published = datetime.fromisoformat(str(meta.get("published_at")).replace("Z", "+00:00"))
        if published.tzinfo is None:
            published = published.replace(tzinfo=timezone.utc)
        years = (datetime.now(timezone.utc) - published).days / 365.25
        if years >= 2:
            labels.append({"label": "Old story", "detail": f"Published {int(years)} years ago. Check it isn't old news recirculating."})
    except (TypeError, ValueError):
        pass
    return satire


def score_manipulation(title: str, body: str, hostname: str, dims: Dimensions) -> None:
    text = f"{title}\n{body}"
    for p in (p for p in PATTERNS if p["scope"] == "any"):
        found = find_all(p["regex"], text)
        if found:
            n = min(len(found), p.get("max", 1))
            dims.add(p["dim"], p["weight"] * n, f'{p["label"]}: "' + '", "'.join(list(dict.fromkeys(found))[:2]) + '"')
    outlet = impersonated_outlet(hostname)
    if outlet:
        dims.add("manipulation", 45, f"Domain imitates a well-known outlet ({outlet}).")


def analysis_confidence(title: str, words: int, english_share: float, extraction_method: str) -> Dict:
    c, notes = 100, []
    if not title:
        c -= 40
        notes.append("No headline could be extracted.")
    if words < MIN_BODY_WORDS:
        c -= 35
        notes.append("Very little article text was available.")
    elif words < 200:
        c -= 15
        notes.append("Short article text limits the sourcing analysis.")
    if words >= 40 and english_share < 0.15:
        c -= 35
        notes.append("The article may not be in English; the lexicons and headline model are English-only.")
    if extraction_method == "beautifulsoup":
        c -= 10
        notes.append("The body was found by a generic fallback and may include non-article text.")
    return {"score": max(5, c), "notes": notes}


def classify(score: int, concern, content_label):
    idx = sum(score >= cut for cut in TIERS)
    level, bucket, verdict = TIER_INFO[idx]
    if content_label and idx < 3:
        return {"tier": idx + 1, "risk_level": level, "bucket": "warning", "verdict": content_label}
    return {"tier": idx + 1, "risk_level": level, "bucket": bucket, "verdict": verdict or concern or "Clickbait"}


def compute_assessment(title: str, body: str, sentences: List[str], meta: Dict) -> Dict:
    dims = Dimensions()
    strengths: List[str] = []
    labels: List[Dict] = []
    highlights: List[str] = []
    tokens = get_tokens(body)
    words = len(tokens)

    if title:
        score_headline(title, dims, highlights)
    density = score_body_tone(body, words, dims)
    alignment, cosine = (None, None)
    if title and words >= MIN_BODY_WORDS:
        alignment, cosine = score_consistency(title, body, sentences, dims, strengths)
    sourcing = score_sourcing(body, words, dims, strengths)
    satire = score_transparency({**meta, "title": title}, body, dims, strengths, labels)
    score_manipulation(title, body, meta.get("hostname", ""), dims)

    dimensions = []
    for d in RULES["dimensions"]:
        sigs = sorted(dims.signals[d["key"]], key=lambda s: -s["points"])
        score = round(100 * (1 - math.exp(-max(0.0, dims.points[d["key"]]) / SATURATION)))
        dimensions.append({"key": d["key"], "label": d["label"], "weight": d["weight"], "score": score, "signals": sigs})

    keep = 1.0
    for d in dimensions:
        keep *= 1 - d["weight"] * max(0, d["score"] - DEAD_ZONE) / (100 - DEAD_ZONE)
    score = round(100 * (1 - keep))

    ranked = sorted(dimensions, key=lambda d: -d["weight"] * d["score"])
    primary = ranked[0] if ranked[0]["score"] >= 25 else None
    concern = DIM_RULES[primary["key"]]["concern"] if primary else None
    sponsored = any(l["label"] == "Sponsored" for l in labels)
    cls = classify(score, concern, "Satire" if satire else "Sponsored Content" if sponsored else None)

    guidance = [DIM_RULES[d["key"]]["guidance"] for d in ranked if d["score"] >= 40 or (d is primary and d["score"] >= 25)][:3]
    if satire:
        guidance.insert(0, "This is satire. Don't share it as if it were real news.")
    summary = SUMMARY_LEAD[cls["risk_level"]]
    if primary and cls["tier"] >= 2:
        summary += f" Biggest issue: {primary['label'].lower()}. {primary['signals'][0]['text']}"
    if satire:
        summary = f"Satire site. {summary}"

    polarity = headline_sentiment(title) if title else 0.0
    english_share = sum(t in STOP_WORDS for t in tokens) / words if words else 1.0
    model = predict_headline(title)
    dim_score = {d["key"]: d["score"] for d in dimensions}
    flat = sorted(
        ((s["points"] * d["weight"], s["text"]) for d in dimensions for s in d["signals"]),
        key=lambda x: -x[0],
    )
    return {
        "score": score,
        **cls,
        "primary_concern": concern,
        "summary": summary,
        "dimensions": dimensions,
        "signals": [t for _, t in flat][:8],
        "strengths": strengths,
        "context_labels": labels,
        "guidance": guidance,
        "headline_highlights": list(dict.fromkeys(h.strip() for h in highlights if len(h.strip()) > 1))[:12],
        "headline_model": {"probability": round(model["probability"], 3), "terms": model["terms"]} if model else None,
        "analysis_confidence": analysis_confidence(title, words, english_share, meta.get("extraction_method", "")),
        "evidence_metrics": {**sourcing, "loaded_density": round(density, 2)},
        # This engine reports the real SBERT cosine here (the Node engine reports lexical alignment).
        "cosine_similarity_score": round(cosine, 4) if cosine is not None else 0.0,
        "sentiment_polarity": round(polarity, 4),
        "semantic_gap": cosine is not None and cosine < SIMILARITY_GAP_THRESHOLD,
        "sensational_tone": abs(polarity) > SENTIMENT_MAG_THRESHOLD or dim_score["sensational"] >= 50,
        "score_breakdown": {
            "semantic_gap_points": dim_score["consistency"],
            "sentiment_points": dim_score["sensational"],
            "hook_points": dim_score["bait"],
            "synergy_points": 0,
        },
    }


# --------------------------------------------------------------------------
# Display extras
# --------------------------------------------------------------------------


def key_phrases_from_body(body: str, limit: int = 8) -> List[str]:
    tokens = [token for token in preprocess_text(body[:6000]).split() if len(token) >= 4 and token.isalpha()]
    return [token for token, _ in Counter(tokens).most_common(limit)]


def grouped_entities(doc, limit_per_group: int = 8) -> Dict[str, List[str]]:
    mapping = {"PERSON": "People", "GPE": "Places", "LOC": "Places", "ORG": "Organizations", "EVENT": "Events"}
    groups: Dict[str, List[str]] = {}
    for ent in doc.ents:
        label = mapping.get(ent.label_)
        text = normalize_whitespace(ent.text).removesuffix("'s")
        if label and len(text) >= 3 and text not in groups.setdefault(label, []):
            groups[label].append(text)
    return {k: v[:limit_per_group] for k, v in groups.items() if v}


def supporting_sentences(headline: str, sentences: List[str], limit: int = 3) -> List[str]:
    H = content_stems(headline)
    scored = []
    for i, s in enumerate(sentences):
        if 30 < len(s) < 400 and H:
            r = share(H, {stem(t) for t in get_tokens(s)}) - i * 0.002
            if r > 0:
                scored.append((r, s))
    scored.sort(key=lambda x: -x[0])
    return [s for _, s in scored[:limit]]


def claims_to_verify(sentences: List[str], exclude: List[str], limit: int = 4) -> List[str]:
    figure = re.compile(r"\d[\d,.]*\s*(%|percent|million|billion|trillion)?|\$\s?\d", re.I)
    scored = []
    for s in sentences:
        if s in exclude or not 30 < len(s) < 400:
            continue
        rank = len(figure.findall(s)) * 2 + (1 if LEX["attribution"].search(s) else 0)
        if rank >= 2:
            scored.append((rank, s))
    scored.sort(key=lambda x: -x[0])
    return [s for _, s in scored[:limit]]


def analyze_article(url: str) -> Dict:
    assert_url_allowed(url)  # fail fast with a clean 400 before any network I/O
    article = scrape_article(url)
    parsed = urlparse(article["final_url"])
    headline = article.get("headline") or ""
    body = article.get("body") or ""
    if not body or len(body) < 80:
        raise ValueError("Could not extract enough article body text.")

    doc = get_nlp()(body[:15000])
    sentences = [normalize_whitespace(s.text) for s in doc.sents if normalize_whitespace(s.text)]
    assessment = compute_assessment(
        headline,
        body,
        sentences,
        {
            "authors": article.get("authors") or [],
            "published_at": article.get("published_at"),
            "site_name": article.get("site_name"),
            "article_type": article.get("article_type"),
            "labels": article.get("labels"),
            "hostname": parsed.hostname or "",
            "scheme": parsed.scheme,
            "path": parsed.path,
            "extraction_method": article.get("extraction_method"),
        },
    )
    support = supporting_sentences(headline, sentences)
    groups = grouped_entities(doc)
    word_count = len(re.findall(r"\w+", body))
    score = assessment["score"]

    return {
        "url": article["final_url"],
        "engine": f"python-nlp ({EMBEDDING_MODEL.split('/')[-1]})",
        "headline": headline,
        "title": headline,
        "headline_extracted": bool(headline),
        **assessment,
        "composite_sensationalism_score": score,
        "legitimacy_confidence_score": 100 - score,
        "body_snippet": normalize_whitespace(body)[:420] + ("..." if len(body) > 420 else ""),
        "source_domain": (parsed.hostname or "").removeprefix("www."),
        "site_name": article.get("site_name") or None,
        "article_type": article.get("article_type") or None,
        "authors": article.get("authors") or [],
        "published_at": article.get("published_at") or "Not available",
        "meta_description": article.get("meta_description") or "Not available",
        "extraction_method": article.get("extraction_method") or "unknown",
        "word_count": word_count,
        "headline_word_count": len(re.findall(r"\w+", headline)),
        "estimated_read_time_minutes": max(1, round(word_count / 220)),
        "numeric_claim_count": len(re.findall(r"\b\d+(?:[.,]\d+)?\b", body)),
        "key_phrases": key_phrases_from_body(body),
        "named_entities": [e for v in groups.values() for e in v][:12],
        "entity_groups": groups,
        "supporting_sentences": support,
        "claims_to_verify": claims_to_verify(sentences, support),
        "fetch_via": "direct fetch",
        "analyzed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


# --------------------------------------------------------------------------
# HTTP layer: security headers, same-origin + JSON-only API, rate limit,
# concurrency cap, security logging. Parity with src/server.js.
# --------------------------------------------------------------------------

CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
    "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; "
    "form-action 'self'; frame-ancestors 'none'"
)
_rate_lock = threading.Lock()
_rate_hits: Dict[str, deque] = {}
_analysis_slots = threading.BoundedSemaphore(MAX_CONCURRENT)


def security_log(event: str, **details) -> None:
    security_logger.warning(
        json.dumps({"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "type": "security", "event": event, "ip": request.remote_addr, **details})
    )


def rate_limited(ip: str) -> bool:
    # ponytail: per-process in-memory window; use a shared store (Redis) if running several workers.
    now = time.monotonic()
    with _rate_lock:
        hits = _rate_hits.setdefault(ip, deque())
        while hits and now - hits[0] > RATE_WINDOW_SECONDS:
            hits.popleft()
        if len(hits) >= RATE_MAX:
            return True
        hits.append(now)
        if len(_rate_hits) > 10000:  # bound memory under IP churn
            _rate_hits.clear()
        return False


@app.after_request
def security_headers(response):
    h = response.headers
    h.setdefault("Content-Security-Policy", CSP)
    h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    h["X-Content-Type-Options"] = "nosniff"
    h["X-Frame-Options"] = "DENY"
    h["Referrer-Policy"] = "strict-origin-when-cross-origin"
    h["Cross-Origin-Opener-Policy"] = "same-origin"
    h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
    if request.path.startswith("/api/"):
        h["Cache-Control"] = "no-store"
    return response


@app.before_request
def guard_api():
    if not request.path.startswith("/api/") or request.method in ("GET", "HEAD", "OPTIONS"):
        return None
    origin = request.headers.get("Origin")
    if request.headers.get("Sec-Fetch-Site") == "cross-site" or (origin and urlparse(origin).hostname != request.host.split(":")[0]):
        security_log("cross_origin_blocked", origin=origin)
        return jsonify({"error": "Cross-origin requests are not allowed."}), 403
    if not request.is_json:
        security_log("bad_content_type", contentType=request.content_type)
        return jsonify({"error": "Request body must be JSON."}), 415
    if rate_limited(request.remote_addr or "unknown"):
        security_log("rate_limited")
        return jsonify({"error": "Too many requests. Please slow down and try again shortly."}), 429
    return None


@app.post("/api/analyze")
def analyze_route():
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"error": "Request body must be valid JSON."}), 400
    url = payload.get("url") if isinstance(payload, dict) else None
    if not url or not isinstance(url, str):
        return jsonify({"error": "Please provide a valid URL."}), 400
    url = url.strip()
    if len(url) > MAX_URL_LENGTH:
        security_log("url_too_long", length=len(url))
        return jsonify({"error": "That URL is too long."}), 414
    if not _analysis_slots.acquire(blocking=False):
        security_log("concurrency_cap")
        return jsonify({"error": "The press is busy. Please try again in a moment."}), 503, {"Retry-After": "5"}

    try:
        return jsonify(analyze_article(url))
    except SsrfBlocked as err:
        security_log("ssrf_blocked", host=urlparse(url).hostname)
        return jsonify({"error": str(err)}), 400
    except ValueError as err:
        return jsonify({"error": str(err)}), 400
    except requests.RequestException:
        return jsonify({"error": "Could not reach that URL. The site may be down or blocking requests."}), 502
    except Exception:
        app.logger.exception("analyze failed")  # details stay server-side
        return jsonify({"error": "Could not analyze this URL right now. Please try a different link."}), 500
    finally:
        _analysis_slots.release()


@app.errorhandler(413)
def too_large(_error):
    security_log("payload_too_large", length=request.content_length)
    return jsonify({"error": "Request body is too large."}), 413


@app.get("/")
def index():
    return send_from_directory(PUBLIC_DIR, "index.html")


@app.get("/healthz")
def healthz():
    return jsonify({"status": "ok"})


# Static assets are served by Flask from PUBLIC_DIR (static_url_path="").
# Unknown /api/ paths get JSON 404; everything else falls back to the SPA.
@app.errorhandler(404)
def spa_fallback(_error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found."}), 404
    return send_from_directory(PUBLIC_DIR, "index.html"), 200


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    app.run(host="0.0.0.0", port=APP_PORT, debug=False)
