# Black Optic 6 — vendored libraries and models

Served from this site so the console's AI stack works offline after one visit.
Nothing here is modified except where noted.

| Path | Package | Version | Licence |
| --- | --- | --- | --- |
| `transformers/transformers.min.js`, `ort-wasm-simd-threaded.jsep.{mjs,wasm}` | `@huggingface/transformers` (bundles ONNX Runtime Web) | 3.7.6 | Apache-2.0 (`LICENSE`) |
| `transformers/ort.webgpu.min.mjs` | `onnxruntime-web` (same build as the bundled runtime, shares its WASM) | 1.22.0-dev.20250409-89f8206ba4 | MIT |
| `mediapipe/audio_bundle.mjs`, `audio_wasm_internal.{js,wasm}` | `@mediapipe/tasks-audio` | 0.10.35 | Apache-2.0 |
| `models/yamnet.tflite` | YAMNet (float32), from `storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/` — sha256 `4d8b4a53282dc83ef04e3e7dbc4fbc98082e34e44ed798e16c3a0cdd4c584faf` | 1 | Apache-2.0 |
| `noble/*.js` | `@noble/hashes` (BLAKE3 and its dependencies; `utils.js` import of `@noble/hashes/crypto` rewritten to `./crypto.js`) | 1.8.0 | MIT (`LICENSE`) |
| `suncalc/suncalc.js` | `suncalc` (mourner/suncalc), UMD export block replaced by an ES-module default export | 1.9.0 | BSD-2-Clause (`LICENSE`) |
| `satellite/satellite.es.js` | `satellite.js` (SGP4/SDP4; its `sunPos` is not used — it mixes degrees and radians in the mean anomaly) | 6.0.1 | MIT (`LICENSE.md`) |
| `world/land-110m.json` | Natural Earth 1:110m land, from `world-atlas` 2.0.2, converted from TopoJSON to plain rings rounded to 0.1° | 2.0.2 | Natural Earth: public domain; world-atlas: ISC (`LICENSE-world-atlas`) |
| `geotiff/geotiff.js` | `geotiff` (browser UMD build) | 2.1.3 | MIT (`LICENSE`) |

Source-map comments were stripped (the maps are not shipped).

Vision model weights (Depth Anything V2 small, OWL-ViT, Grounding DINO tiny,
SlimSAM) are not stored here: transformers.js downloads them from the Hugging
Face hub on first use and the browser keeps them in Cache Storage.
