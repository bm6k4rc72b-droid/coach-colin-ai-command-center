# ranch-edge for x86 with an NVIDIA GPU. On a Jetson, install.sh runs the
# service inside the jetson-containers NanoOWL image instead, because NanoOWL
# and NanoSAM need TensorRT builds that match the exact JetPack version.
FROM nvcr.io/nvidia/pytorch:24.05-py3
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && pip install --no-cache-dir PytorchWildlife rfdetr ultralytics
COPY ranch_edge ./ranch_edge
EXPOSE 8787
CMD ["uvicorn", "ranch_edge.app:app", "--host", "0.0.0.0", "--port", "8787"]
