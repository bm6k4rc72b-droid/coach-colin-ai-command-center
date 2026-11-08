"""ranch-edge: the RANCH COMMAND edge service.

Runs on the ranch's edge box (an NVIDIA Jetson, or a PC with an NVIDIA GPU)
next to Frigate, Mosquitto, MediaMTX and mavlink2rest. It does three things:

1. Enriches Frigate's detections with the heavier models — MegaDetector V6,
   RF-DETR and Cowcatcher/Calvingcatcher — routes them with the same
   ``rules.json`` the dashboard uses, and republishes them on ``ranch/events``.
2. Serves the dashboard's ``/v1`` API: NanoOWL text search, NanoSAM
   segmentation, health, and a proxy for Frigate snapshots.
3. Reports honestly which of those models are actually loaded.

Every model is optional. A model that is not installed is reported as down
by ``/v1/health`` and its endpoint answers 503 — nothing is faked.
"""

__version__ = "1.0.0"
