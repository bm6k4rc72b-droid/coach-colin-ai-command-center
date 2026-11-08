"""The dashboard's /v1 API.

    GET  /v1/health                         which services and models are up
    POST /v1/owl    {image, prompts, threshold}   NanoOWL text search
    POST /v1/sam    {image, points}               NanoSAM segmentation
    GET  /v1/frigate/events/{id}/snapshot.jpg     Frigate snapshot, proxied
    GET  /v1/events                          the last enriched events

``image`` is a JPEG data URL, as the dashboard's grabFrame produces.
"""

from __future__ import annotations

import base64
import os
import socket
import threading
import time
import urllib.request
from collections import deque
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import __version__, models
from .routing import load_rules

RULES_PATH = os.environ.get("RULES_PATH", str(Path(__file__).resolve().parents[3] / "public" / "ranch-command" / "rules.json"))
FRIGATE_URL = os.environ.get("FRIGATE_URL", "http://frigate:5000")

app = FastAPI(title="ranch-edge", version=__version__)
app.add_middleware(
    CORSMiddleware,
    # The dashboard's origin. Add your own if you host it elsewhere.
    allow_origins=[o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "https://bm6k4rc72b-droid.github.io").split(",")],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

RECENT: deque[dict[str, Any]] = deque(maxlen=200)


def decode_image(data_url: str) -> bytes:
    """Decode a data URL (or bare base64) to bytes, refusing anything absurd."""
    payload = data_url.split(",", 1)[1] if data_url.startswith("data:") else data_url
    raw = base64.b64decode(payload, validate=False)
    if len(raw) > 12 * 1024 * 1024:
        raise HTTPException(413, "Image larger than 12 MB.")
    return raw


def _tcp(host: str, port: int) -> dict[str, Any]:
    try:
        with socket.create_connection((host, port), timeout=1.5):
            return {"ok": True, "detail": f"{host}:{port} reachable"}
    except OSError as exc:
        return {"ok": False, "detail": f"{host}:{port} {exc.strerror or exc}"}


def _http(url: str) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            return {"ok": response.status < 500, "detail": f"HTTP {response.status}"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "detail": str(exc)[:120]}


@app.get("/v1/health")
def health() -> dict[str, Any]:
    """Live status of every service and model. Unknown is reported as unknown."""
    components = {
        "frigate": _http(f"{FRIGATE_URL}/api/version"),
        "go2rtc": _http(os.environ.get("GO2RTC_URL", "http://frigate:1984") + "/api"),
        "mqtt": _tcp(os.environ.get("MQTT_HOST", "mosquitto"), int(os.environ.get("MQTT_PORT", "1883"))),
        "mediamtx": _tcp(os.environ.get("MEDIAMTX_HOST", "mediamtx"), 8889),
        "mavlink": _tcp(os.environ.get("MAVLINK2REST_HOST", "mavlink2rest"), 8088),
    }
    components.update(models.status())
    return {"version": __version__, "time": time.time(), "components": components}


class OwlRequest(BaseModel):
    image: str
    prompts: list[str] = Field(min_length=1, max_length=16)
    threshold: float = Field(0.1, ge=0.01, le=0.9)


@app.post("/v1/owl")
def owl(request: OwlRequest) -> dict[str, Any]:
    prompts = [p.strip()[:60] for p in request.prompts if p.strip()]
    try:
        started = time.perf_counter()
        detections = models.owl_detect(decode_image(request.image), prompts, request.threshold)
    except models.ModelUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    return {"via": f"NanoOWL · edge · {round((time.perf_counter() - started) * 1000)} ms", "detections": detections}


class SamRequest(BaseModel):
    image: str
    points: list[list[float]] = Field(min_length=1, max_length=8)


@app.post("/v1/sam")
def sam(request: SamRequest) -> dict[str, Any]:
    try:
        started = time.perf_counter()
        png, score, width, height = models.sam_segment(decode_image(request.image), request.points)
    except models.ModelUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    return {
        "via": f"NanoSAM · edge · {round((time.perf_counter() - started) * 1000)} ms",
        "mask": "data:image/png;base64," + base64.b64encode(png).decode(),
        "score": score, "width": width, "height": height,
    }


@app.get("/v1/frigate/events/{event_id}/snapshot.jpg")
def frigate_snapshot(event_id: str) -> Response:
    if not all(c.isalnum() or c in ".-_" for c in event_id):
        raise HTTPException(400, "Bad event id.")
    try:
        with urllib.request.urlopen(f"{FRIGATE_URL}/api/events/{event_id}/snapshot.jpg", timeout=8) as r:
            return Response(r.read(), media_type="image/jpeg", headers={"Cache-Control": "max-age=300"})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Frigate: {exc}") from exc


@app.get("/v1/events")
def events() -> list[dict[str, Any]]:
    return list(RECENT)


def start_worker() -> None:  # pragma: no cover — needs a broker
    """Run the enrichment worker beside the API, recording what it publishes."""
    from . import enrich

    rules = load_rules(RULES_PATH)
    original = enrich.enrich

    def recorded(*args, **kwargs):
        event = original(*args, **kwargs)
        RECENT.appendleft(event)
        return event

    enrich.enrich = recorded
    threading.Thread(target=enrich.run, args=(rules,), daemon=True, name="enrich").start()


if os.environ.get("RANCH_EDGE_WORKER", "1") == "1" and os.environ.get("RANCH_EDGE_TESTING") != "1":  # pragma: no cover
    app.add_event_handler("startup", start_worker)
