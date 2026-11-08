"""The /v1 API, with no models installed: honest 503s and an honest health report."""

import base64
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "edge" / "ranch-command"))
os.environ["RANCH_EDGE_TESTING"] = "1"
os.environ.setdefault("FRIGATE_URL", "http://127.0.0.1:9")
os.environ.setdefault("MQTT_HOST", "127.0.0.1")
os.environ.setdefault("MQTT_PORT", "9")

try:
    from fastapi.testclient import TestClient
    from ranch_edge.app import app
except ImportError as exc:  # pragma: no cover
    raise unittest.SkipTest(f"fastapi not installed: {exc}")

client = TestClient(app)
PIXEL = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff\xd9").decode()


class Api(unittest.TestCase):
    def test_health_reports_every_component(self):
        body = client.get("/v1/health").json()
        for key in ("frigate", "go2rtc", "mqtt", "mediamtx", "mavlink", "nanoowl", "nanosam", "megadetector", "rfdetr", "cowcatcher"):
            self.assertIn(key, body["components"])
        self.assertFalse(body["components"]["frigate"]["ok"], "nothing is listening, so Frigate must be reported down")
        self.assertIsNone(body["components"]["nanoowl"]["ok"], "an untried model is unknown, not up")

    def test_owl_without_nanoowl_is_503(self):
        r = client.post("/v1/owl", json={"image": PIXEL, "prompts": ["open gate"]})
        self.assertEqual(r.status_code, 503)
        self.assertIn("NanoOWL unavailable", r.json()["detail"])
        self.assertFalse(client.get("/v1/health").json()["components"]["nanoowl"]["ok"])

    def test_sam_without_nanosam_is_503(self):
        self.assertEqual(client.post("/v1/sam", json={"image": PIXEL, "points": [[10, 10, 1]]}).status_code, 503)

    def test_requests_are_validated(self):
        self.assertEqual(client.post("/v1/owl", json={"image": PIXEL, "prompts": []}).status_code, 422)
        self.assertEqual(client.get("/v1/frigate/events/..%2Fetc/snapshot.jpg").status_code in (400, 404), True)

    def test_cors_allows_the_dashboard(self):
        r = client.options("/v1/health", headers={"Origin": "https://bm6k4rc72b-droid.github.io", "Access-Control-Request-Method": "GET"})
        self.assertEqual(r.headers.get("access-control-allow-origin"), "https://bm6k4rc72b-droid.github.io")
        r = client.options("/v1/health", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
        self.assertNotEqual(r.headers.get("access-control-allow-origin"), "https://evil.example")


if __name__ == "__main__":
    unittest.main()
