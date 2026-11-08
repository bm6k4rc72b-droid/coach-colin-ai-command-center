"""The enrichment worker: Frigate events in, refined and routed events out.

Subscribes to ``frigate/events``. For each new tracked object it pulls the
snapshot from Frigate, runs whichever heavy models apply, picks the most
specific label any of them produced, routes it with rules.json, and
publishes the result on ``ranch/events`` for the dashboard.

Which models run is decided by what Frigate saw and where:

- an animal, person or vehicle → MegaDetector V6 (better at night IR and
  camera-trap angles than Frigate's general model);
- anything on a camera listed in CALVING_CAMERAS → Cowcatcher;
- if RFDETR_WEIGHTS is set (a model fine-tuned on this ranch) → RF-DETR.
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.request
from typing import Any

from . import models
from .routing import route

log = logging.getLogger("ranch_edge.enrich")

FRIGATE_URL = os.environ.get("FRIGATE_URL", "http://frigate:5000")
CALVING_CAMERAS = {c.strip() for c in os.environ.get("CALVING_CAMERAS", "").split(",") if c.strip()}
SPECIFIC = ("calving", "coyote", "bear", "mountain_lion", "cougar", "bobcat", "wolf", "deer", "elk", "cow", "cattle", "horse", "sheep", "goat")


def snapshot(frigate_id: str) -> bytes:
    """Fetch an event's snapshot from Frigate's internal API."""
    with urllib.request.urlopen(f"{FRIGATE_URL}/api/events/{frigate_id}/snapshot.jpg?bbox=0", timeout=10) as response:
        return response.read()


def most_specific(base: str, found: list[dict[str, Any]]) -> tuple[str, float | None]:
    """The most specific label any model produced: calving, then a named species, else the original."""
    for wanted in SPECIFIC:
        hits = [d for d in found if d["label"].lower().replace(" ", "_") == wanted]
        if hits:
            best = max(hits, key=lambda d: d["score"])
            return best["label"], best["score"]
    return base, None


def enrich(after: dict[str, Any], rules: dict[str, Any], image: bytes | None = None, fetch=snapshot) -> dict[str, Any]:
    """Turn one Frigate tracked object into a ranch event."""
    label = after.get("sub_label")
    label = label[0] if isinstance(label, list) else label
    label = label or after["label"]
    camera = after.get("camera", "camera")
    zones = sorted(set((after.get("current_zones") or []) + (after.get("entered_zones") or [])))
    ran: list[str] = []
    found: list[dict[str, Any]] = []
    if image is None and after.get("has_snapshot"):
        try:
            image = fetch(after["id"])
        except Exception as exc:  # noqa: BLE001
            log.warning("snapshot for %s failed: %s", after["id"], exc)
    if image:
        jobs = []
        if after["label"] in ("animal", "person", "car", "truck", "dog", "cat", "bird", "horse", "cow", "sheep", "bear"):
            jobs.append(("megadetector-v6", models.megadetector))
        if camera in CALVING_CAMERAS:
            jobs.append(("cowcatcher", models.cowcatcher))
        if os.environ.get("RFDETR_WEIGHTS"):
            jobs.append(("rf-detr", models.rfdetr))
        for name, job in jobs:
            try:
                found.extend(job(image))
                ran.append(name)
            except models.ModelUnavailable as exc:
                log.info("%s", exc)
    refined, score = most_specific(label, found)
    event = {
        "id": after["id"],
        "phase": "new",
        "camera": camera,
        "label": refined,
        "base_label": after["label"],
        "score": score if score is not None else float(after.get("top_score") or after.get("score") or 0),
        "zones": zones,
        "start": after.get("start_time") or time.time(),
        "models": ran,
        "snapshot_url": None,
    }
    event["routing"] = route(event, rules)
    return event


def run(rules: dict[str, Any]) -> None:  # pragma: no cover — needs a broker
    """Connect to the broker and enrich forever."""
    import paho.mqtt.client as mqtt

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="ranch-edge")
    if os.environ.get("MQTT_USER"):
        client.username_pw_set(os.environ["MQTT_USER"], os.environ.get("MQTT_PASSWORD"))
    done: set[str] = set()

    def on_connect(c, _userdata, _flags, reason, _props):
        log.info("connected to MQTT (%s)", reason)
        c.subscribe("frigate/events")

    def on_message(c, _userdata, msg):
        try:
            payload = json.loads(msg.payload)
        except ValueError:
            return
        after = payload.get("after") or {}
        # Once per tracked object, when Frigate first has a snapshot for it.
        if not after.get("id") or after["id"] in done or after.get("false_positive"):
            return
        if payload.get("type") == "new" and not after.get("has_snapshot"):
            return
        done.add(after["id"])
        if len(done) > 5000:
            done.clear()
        event = enrich(after, rules)
        c.publish("ranch/events", json.dumps(event), qos=1)
        log.info("%s %s → %s (%s)", event["camera"], event["label"], event["routing"]["rule"], ",".join(event["models"]) or "frigate only")

    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(os.environ.get("MQTT_HOST", "mosquitto"), int(os.environ.get("MQTT_PORT", "1883")))
    client.loop_forever(retry_first_connection=True)
