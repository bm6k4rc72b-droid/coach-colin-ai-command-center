"""The edge router must agree with the browser router on every shared case."""

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "edge" / "ranch-command"))

from ranch_edge.routing import is_night, kind_of, load_rules, route  # noqa: E402
from ranch_edge.enrich import enrich, most_specific  # noqa: E402

RULES = load_rules(ROOT / "public" / "ranch-command" / "rules.json")
CASES = json.loads((ROOT / "tests" / "ranch-command" / "fixtures" / "routing.json").read_text())["cases"]


class SharedCases(unittest.TestCase):
    def test_every_shared_case(self):
        for case in CASES:
            with self.subTest(case["name"]):
                got = route(case["event"], RULES, hour=case["hour"])
                self.assertEqual({k: got[k] for k in ("rule", "workflow", "priority")}, case["expect"])

    def test_kinds(self):
        self.assertEqual(kind_of("Mountain Lion", RULES), "predator")
        self.assertEqual(kind_of("spaceship", RULES), "unknown")

    def test_night_window(self):
        self.assertTrue(is_night(23, {"start": 20, "end": 6}))
        self.assertFalse(is_night(12, {"start": 20, "end": 6}))
        self.assertTrue(is_night(3, {"start": 1, "end": 5}))


class Enrichment(unittest.TestCase):
    def test_calving_beats_a_generic_label(self):
        label, score = most_specific("cow", [{"label": "cow", "score": 0.9}, {"label": "calving", "score": 0.6}])
        self.assertEqual((label, score), ("calving", 0.6))

    def test_no_models_keeps_frigate_label_and_says_so(self):
        # No snapshot and no models installed: the event passes through,
        # routed, with an empty model list rather than a pretend refinement.
        event = enrich({"id": "1.2-x", "camera": "north_gate", "label": "cow", "top_score": 0.8,
                        "current_zones": ["north_gate"], "has_snapshot": False, "start_time": 0}, RULES)
        self.assertEqual(event["label"], "cow")
        self.assertEqual(event["models"], [])
        self.assertEqual(event["routing"]["workflow"], "livestock")

    def test_a_missing_model_is_skipped_not_faked(self):
        event = enrich({"id": "1.3-y", "camera": "barn", "label": "animal", "sub_label": ["coyote", 0.7],
                        "top_score": 0.7, "current_zones": ["calving_pen"], "has_snapshot": True, "start_time": 0},
                       RULES, image=b"not-a-real-jpeg")
        self.assertEqual(event["label"], "coyote")
        self.assertEqual(event["models"], [], "MegaDetector is not installed here, so it must not be listed")
        self.assertEqual(event["routing"]["rule"], "predator-near-stock")


if __name__ == "__main__":
    unittest.main()
