"""Python engine checks (run: .venv/bin/python -m unittest tests/test_app.py).

Not part of `npm test` / CI (needs the spaCy + sentence-transformers stack).
Uses the small cached MiniLM model unless CLICKBAIT_EMBEDDING_MODEL is set.
"""

import json
import os
import subprocess
import sys
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("CLICKBAIT_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
os.environ.setdefault("HF_HUB_OFFLINE", "1")
sys.path.insert(0, ROOT)

import app as engine  # noqa: E402


def node(expr: str):
    out = subprocess.run(["node", "-p", expr], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


FIXTURES = node('JSON.stringify(require("./tests/fixtures"))')
CASES = [
    ("CLICKBAIT_HTML", "https://example.com/news/story", "Clickbait"),
    ("LEGIT_HTML", "https://example.com/news/story", "Straight Reporting"),
    ("MISLEADING_SCIENCE_HTML", "https://example.com/news/story", "Misleading Headline"),
    ("SCAM_HTML", "http://abcnews.com.co/health/pill", "Manipulative"),
    ("RUMOR_HTML", "https://example.com/news/story", "Unsubstantiated"),
    ("SPONSORED_HTML", "https://example.com/news/story", "Sponsored Content"),
    ("SATIRE_HTML", "https://www.theonion.com/area-man", "Satire"),
]


class EngineParity(unittest.TestCase):
    def test_headline_features_match_node(self):
        heads = ["You Won’t Believe What This Mom Did!", "17 Things Only 90s Kids Know", "Fed holds rates"]
        js = node(
            "JSON.stringify(%s.map(h => require('./src/headlineModel').headlineFeatures(h).sort()))"
            % json.dumps(heads)
        )
        self.assertEqual([sorted(engine.headline_features(h)) for h in heads], js)

    def test_fixture_verdicts_match_node_contract(self):
        for name, url, verdict in CASES:
            with self.subTest(name=name), mock.patch.object(engine, "safe_get", return_value=(FIXTURES[name], url)):
                with mock.patch.object(engine, "assert_url_allowed"):
                    result = engine.analyze_article(url)
                self.assertEqual(result["verdict"], verdict, result["signals"])
                self.assertEqual(len(result["dimensions"]), 6)


class Security(unittest.TestCase):
    def setUp(self):
        self.client = engine.app.test_client()

    def test_redirect_to_private_address_is_blocked(self):
        redirect = mock.Mock(is_redirect=True, headers={"Location": "http://127.0.0.1/admin"})
        with mock.patch.object(engine.requests, "get", return_value=redirect):
            with self.assertRaises(engine.SsrfBlocked):
                engine.safe_get("http://8.8.8.8/start")

    def test_cross_origin_and_non_json_are_refused(self):
        r = self.client.post("/api/analyze", json={"url": "https://x.com"}, headers={"Origin": "https://evil.example"})
        self.assertEqual(r.status_code, 403)
        r = self.client.post("/api/analyze", data='{"url":"x"}', content_type="text/plain")
        self.assertEqual(r.status_code, 415)

    def test_security_headers_and_size_limit(self):
        r = self.client.get("/healthz")
        self.assertIn("max-age", r.headers["Strict-Transport-Security"])
        self.assertIn("frame-ancestors 'none'", r.headers["Content-Security-Policy"])
        r = self.client.post("/api/analyze", json={"url": "https://e.com/" + "a" * 5000})
        self.assertEqual(r.status_code, 413)

    def test_errors_do_not_leak_details(self):
        with mock.patch.object(engine, "analyze_article", side_effect=RuntimeError("secret path /etc")):
            r = self.client.post("/api/analyze", json={"url": "https://example.com/a"})
        self.assertEqual(r.status_code, 500)
        self.assertNotIn("secret", r.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
