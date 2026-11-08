#!/usr/bin/env bash
# RANCH COMMAND edge box installer.
#
# Run on the edge box from this directory:   ./install.sh
#
# Detects a Jetson (JetPack 6) or an x86 PC with an NVIDIA GPU, generates
# passwords, creates the MQTT users, starts Frigate, Mosquitto, MediaMTX and
# mavlink2rest, and starts ranch-edge with NanoOWL. It never opens anything
# to the internet; the last step prints the Tailscale Serve commands that
# give the dashboard HTTPS access over your private tailnet.
#
# Safe to run again: existing passwords and data are kept.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1;33m▸ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "Docker is required (JetPack includes it; on x86 install Docker and the NVIDIA Container Toolkit)."
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (docker compose …)."

if [ -f /etc/nv_tegra_release ]; then PLATFORM=jetson; else PLATFORM=x86; fi
say "Platform: $PLATFORM"

mkdir -p data/frigate data/mosquitto data/models

# ---------------------------------------------------------------- secrets
if [ ! -f .env ]; then
  say "Creating .env with generated passwords"
  cp .env.example .env
  for key in FRIGATE_MQTT_PASSWORD RANCH_EDGE_MQTT_PASSWORD; do
    sed -i "s|^${key}=.*|${key}=$(openssl rand -hex 16)|" .env
  done
fi
# shellcheck disable=SC1091
set -a; . ./.env; set +a

if [ ! -s config/mosquitto.passwd ]; then
  say "Creating MQTT users: frigate, ranch-edge, dashboard"
  DASHBOARD_MQTT_PASSWORD=$(openssl rand -hex 12)
  : > config/mosquitto.passwd
  for pair in "frigate:${FRIGATE_MQTT_PASSWORD}" "ranch-edge:${RANCH_EDGE_MQTT_PASSWORD}" "dashboard:${DASHBOARD_MQTT_PASSWORD}"; do
    docker run --rm -v "$PWD/config:/c" eclipse-mosquitto:2 mosquitto_passwd -b /c/mosquitto.passwd "${pair%%:*}" "${pair#*:}"
  done
  printf 'DASHBOARD_MQTT_PASSWORD=%s\n' "$DASHBOARD_MQTT_PASSWORD" >> .env
  chmod 600 .env config/mosquitto.passwd
fi

# --------------------------------------------------------------- services
say "Starting Frigate, Mosquitto, MediaMTX and mavlink2rest"
docker compose --profile "$PLATFORM" up -d

# ------------------------------------------------------------- ranch-edge
if [ "$PLATFORM" = jetson ]; then
  if [ ! -d jetson-containers ]; then
    say "Fetching jetson-containers (builds NanoOWL / NanoSAM for this JetPack)"
    git clone --depth 1 https://github.com/dusty-nv/jetson-containers
    bash jetson-containers/install.sh
  fi
  IMAGE=$(autotag nanoowl)
  say "NanoOWL image: $IMAGE"
  if [ ! -f data/models/owl_image_encoder_patch32.engine ]; then
    say "Building the NanoOWL TensorRT engine (several minutes, once)"
    docker run --rm --runtime nvidia -v "$PWD/data/models:/models" "$IMAGE" \
      bash -lc 'cd /opt/nanoowl && python3 -m nanoowl.build_image_encoder_engine /models/owl_image_encoder_patch32.engine'
  fi
  docker rm -f ranch-edge >/dev/null 2>&1 || true
  say "Starting ranch-edge inside the NanoOWL image"
  docker run -d --name ranch-edge --restart unless-stopped --runtime nvidia --network host \
    -v "$PWD/ranch_edge:/app/ranch_edge:ro" -v "$PWD/requirements.txt:/app/requirements.txt:ro" \
    -v "$PWD/../../public/ranch-command/rules.json:/app/rules.json:ro" -v "$PWD/data/models:/models" \
    -e FRIGATE_URL=http://127.0.0.1:5000 -e GO2RTC_URL=http://127.0.0.1:1984 -e MQTT_HOST=127.0.0.1 \
    -e MEDIAMTX_HOST=127.0.0.1 -e MAVLINK2REST_HOST=127.0.0.1 \
    -e MQTT_USER=ranch-edge -e MQTT_PASSWORD="$RANCH_EDGE_MQTT_PASSWORD" -e RULES_PATH=/app/rules.json \
    -e ALLOWED_ORIGINS="${ALLOWED_ORIGINS}" -e CALVING_CAMERAS="${CALVING_CAMERAS:-}" -e COWCATCHER_WEIGHTS="${COWCATCHER_WEIGHTS:-}" \
    -e NANOOWL_ENGINE=/models/owl_image_encoder_patch32.engine \
    -e NANOSAM_ENCODER=/models/resnet18_image_encoder.engine -e NANOSAM_DECODER=/models/mobile_sam_mask_decoder.engine \
    "$IMAGE" bash -lc 'cd /app && pip install -q -r requirements.txt && uvicorn ranch_edge.app:app --host 0.0.0.0 --port 8787'
  if [ ! -f data/models/mobile_sam_mask_decoder.engine ]; then
    say "NanoSAM engines not found in data/models"
    echo "  NanoSAM's two engines are built from ONNX files its README links to; follow"
    echo "  https://github.com/NVIDIA-AI-IOT/nanosam#setup inside \$(autotag nanosam) and put"
    echo "  resnet18_image_encoder.engine and mobile_sam_mask_decoder.engine in data/models."
    echo "  Until then /v1/health reports NanoSAM as down and the dashboard uses SlimSAM in the browser."
  fi
fi

# ----------------------------------------------------------------- finish
say "Checking ranch-edge"
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8787/v1/health >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS http://127.0.0.1:8787/v1/health || echo "ranch-edge is not answering yet — see: docker logs ranch-edge"

cat <<EOF

Done. To give the dashboard HTTPS access over your tailnet (install Tailscale
on this box and on your iPhone first), run:

  tailscale serve --bg --https=443   http://127.0.0.1:8787    # ranch-edge API
  tailscale serve --bg --https=8443  http://127.0.0.1:9001    # MQTT over WebSocket
  tailscale serve --bg --https=10000 http://127.0.0.1:1984    # go2rtc WebRTC signalling

Then in the dashboard's Setup slide:
  Edge box:  https://$(hostname).<your-tailnet>.ts.net
  MQTT:      wss://$(hostname).<your-tailnet>.ts.net:8443   user: dashboard  password: see .env
  Cameras:   https://$(hostname).<your-tailnet>.ts.net:10000/api/webrtc?src=north_gate

Check with: tailscale serve status
EOF
