"""The heavy models, each loaded lazily and each reporting its own status.

Nothing here pretends. If a package or an engine file is missing, the model
stays unloaded, ``status()`` says why, and callers get ``ModelUnavailable``.
Paths and model choices come from environment variables (see README.md), so
nothing is hard-coded to one Jetson's layout.

The Python APIs used follow each project's own README at the time of
writing; they are isolated in this file so a breaking upstream change is a
one-function fix.
"""

from __future__ import annotations

import io
import os
import threading
from typing import Any, Callable

COWCATCHER_CALVING = ("calv", "birth", "labor", "labour")


class ModelUnavailable(RuntimeError):
    """A model was asked for but is not installed or failed to load."""


class Lazy:
    """Load once, on first use, and remember a failure instead of retrying every frame."""

    def __init__(self, name: str, loader: Callable[[], Any]):
        self.name = name
        self.loader = loader
        self.value: Any = None
        self.error: str | None = None
        self.tried = False
        self.lock = threading.Lock()

    def get(self) -> Any:
        with self.lock:
            if not self.tried:
                self.tried = True
                try:
                    self.value = self.loader()
                except Exception as exc:  # noqa: BLE001 — any import or engine error means "unavailable"
                    self.error = f"{type(exc).__name__}: {exc}"
        if self.value is None:
            raise ModelUnavailable(f"{self.name} unavailable: {self.error or 'not loaded'}")
        return self.value

    def status(self) -> dict[str, Any]:
        if not self.tried:
            return {"ok": None, "detail": "not loaded yet (loads on first use)"}
        return {"ok": self.value is not None, "detail": "loaded" if self.value is not None else self.error}


def _image(data: bytes):
    from PIL import Image  # pillow is a hard requirement of every model here

    return Image.open(io.BytesIO(data)).convert("RGB")


# ------------------------------------------------------------- NanoOWL

def _load_owl():
    from nanoowl.owl_predictor import OwlPredictor

    return OwlPredictor(
        os.environ.get("NANOOWL_MODEL", "google/owlvit-base-patch32"),
        image_encoder_engine=os.environ.get("NANOOWL_ENGINE", "/opt/nanoowl/data/owl_image_encoder_patch32.engine"),
    )


OWL = Lazy("NanoOWL", _load_owl)


def owl_detect(image_bytes: bytes, prompts: list[str], threshold: float = 0.1) -> list[dict[str, Any]]:
    """Open-vocabulary detection: boxes are ``[x1, y1, x2, y2]`` in image pixels."""
    predictor = OWL.get()
    image = _image(image_bytes)
    encodings = predictor.encode_text(prompts)
    out = predictor.predict(image=image, text=prompts, text_encodings=encodings, threshold=threshold, pad_square=False)
    boxes = out.boxes.detach().cpu().tolist()
    labels = out.labels.detach().cpu().tolist()
    scores = out.scores.detach().cpu().tolist()
    return [{"label": prompts[int(l)], "score": float(s), "box": [float(v) for v in b]} for b, l, s in zip(boxes, labels, scores)]


# ------------------------------------------------------------- NanoSAM

def _load_sam():
    from nanosam.utils.predictor import Predictor

    return Predictor(
        os.environ.get("NANOSAM_ENCODER", "/opt/nanosam/data/resnet18_image_encoder.engine"),
        os.environ.get("NANOSAM_DECODER", "/opt/nanosam/data/mobile_sam_mask_decoder.engine"),
    )


SAM = Lazy("NanoSAM", _load_sam)


def sam_segment(image_bytes: bytes, points: list[list[float]]) -> tuple[bytes, float, int, int]:
    """Segment from prompt points ``[x, y, label]``; returns a PNG mask (neon green, alpha), score, width, height."""
    import numpy as np
    from PIL import Image

    predictor = SAM.get()
    image = _image(image_bytes)
    predictor.set_image(image)
    coords = np.array([[p[0], p[1]] for p in points], dtype=np.float32)
    labels = np.array([int(p[2]) if len(p) > 2 else 1 for p in points], dtype=np.float32)
    mask, iou, _ = predictor.predict(coords, labels)
    binary = (mask[0, 0] > 0).detach().cpu().numpy()
    h, w = binary.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[binary] = (57, 255, 20, 140)
    buffer = io.BytesIO()
    Image.fromarray(rgba, "RGBA").resize(image.size).save(buffer, format="PNG")
    score = float(iou[0, 0]) if hasattr(iou, "__getitem__") else 0.0
    return buffer.getvalue(), score, image.size[0], image.size[1]


# --------------------------------------------------------- MegaDetector

def _load_megadetector():
    import torch
    from PytorchWildlife.models import detection as pw_detection

    return pw_detection.MegaDetectorV6(
        device="cuda" if torch.cuda.is_available() else "cpu",
        pretrained=True,
        version=os.environ.get("MEGADETECTOR_VERSION", "MDV6-yolov9-c"),
    )


MEGADETECTOR = Lazy("MegaDetector V6", _load_megadetector)


def megadetector(image_bytes: bytes, threshold: float = 0.3) -> list[dict[str, Any]]:
    """Animal / person / vehicle detections from MegaDetector V6."""
    import numpy as np

    model = MEGADETECTOR.get()
    result = model.single_image_detection(np.array(_image(image_bytes)))
    det = result["detections"]
    names = getattr(model, "CLASS_NAMES", {0: "animal", 1: "person", 2: "vehicle"})
    out = []
    for box, conf, cls in zip(det.xyxy.tolist(), det.confidence.tolist(), det.class_id.tolist()):
        if conf >= threshold:
            out.append({"label": names.get(int(cls), "animal"), "score": float(conf), "box": [float(v) for v in box]})
    return out


# --------------------------------------------------------------- RF-DETR

def _load_rfdetr():
    from rfdetr import RFDETRBase

    weights = os.environ.get("RFDETR_WEIGHTS")
    return RFDETRBase(pretrain_weights=weights) if weights else RFDETRBase()


RFDETR = Lazy("RF-DETR", _load_rfdetr)


def rfdetr(image_bytes: bytes, threshold: float = 0.5) -> list[dict[str, Any]]:
    """RF-DETR detections. Class names come from RFDETR_CLASSES (comma-separated) for a fine-tuned model, else COCO."""
    model = RFDETR.get()
    det = model.predict(_image(image_bytes), threshold=threshold)
    custom = os.environ.get("RFDETR_CLASSES")
    if custom:
        names = [c.strip() for c in custom.split(",")]
        name = lambda i: names[i] if i < len(names) else str(i)  # noqa: E731
    else:
        from rfdetr.util.coco_classes import COCO_CLASSES

        name = lambda i: COCO_CLASSES.get(i, str(i)) if isinstance(COCO_CLASSES, dict) else COCO_CLASSES[i]  # noqa: E731
    return [{"label": name(int(c)), "score": float(s), "box": [float(v) for v in b]}
            for b, s, c in zip(det.xyxy.tolist(), det.confidence.tolist(), det.class_id.tolist())]


# ------------------------------------------------------------ Cowcatcher

def _load_cowcatcher():
    weights = os.environ.get("COWCATCHER_WEIGHTS")
    if not weights or not os.path.exists(weights):
        raise FileNotFoundError("set COWCATCHER_WEIGHTS to the .pt file downloaded from the Cowcatcher model card")
    from ultralytics import YOLO

    return YOLO(weights)


COWCATCHER = Lazy("Cowcatcher", _load_cowcatcher)


def cowcatcher(image_bytes: bytes, threshold: float = 0.4) -> list[dict[str, Any]]:
    """Cattle and calving-stage detections. Any class whose name mentions calving or birth is reported as ``calving``."""
    model = COWCATCHER.get()
    result = model.predict(_image(image_bytes), conf=threshold, verbose=False)[0]
    out = []
    for box in result.boxes:
        raw = result.names[int(box.cls)]
        label = "calving" if any(k in raw.lower() for k in COWCATCHER_CALVING) else raw
        out.append({"label": label, "raw_label": raw, "score": float(box.conf), "box": [float(v) for v in box.xyxy[0].tolist()]})
    return out


ALL = {"nanoowl": OWL, "nanosam": SAM, "megadetector": MEGADETECTOR, "rfdetr": RFDETR, "cowcatcher": COWCATCHER}


def status() -> dict[str, dict[str, Any]]:
    """Every model's state, for /v1/health."""
    return {key: lazy.status() for key, lazy in ALL.items()}
