# ViralX: vendored libraries and models

These are served from this site, so the app works without a CDN. The files are unmodified,
except that source-map comments were stripped.

| Path | Package | Version | Licence |
| --- | --- | --- | --- |
| `mediapipe/vision_bundle.mjs`, `vision_wasm_internal.{js,wasm}` | `@mediapipe/tasks-vision` | 0.10.21 | Apache-2.0 |
| `models/blaze_face_short_range.tflite` | BlazeFace short-range (float16), sha256 `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f` | 1 | Apache-2.0 |
| `models/pose_landmarker_lite.task` | Pose Landmarker lite (float16), sha256 `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` | 1 | Apache-2.0 |
| `tesseract/tesseract.esm.min.js`, `worker.min.js` | `tesseract.js` | 5.1.1 | Apache-2.0 (`LICENSE.md`) |
| `tesseract/tesseract-core-{simd-,}lstm.wasm.js` | `tesseract.js-core` | 5.1.1 | Apache-2.0 |
| `tesseract/eng.traineddata.gz` | `@tesseract.js-data/eng` 4.0.0_best_int | 1.0.0 | Apache-2.0 |
| `anthropic/sdk.mjs` | `@anthropic-ai/sdk`, bundled to one ES module with esbuild | 1.3.0 | MIT (`LICENSE`) |

transformers.js (CLIP, RoBERTa, Whisper) is shared with Black Optic 6 from
`../black-optic-6/vendor/transformers/`. The model weights download from the Hugging Face hub
on first use, and the browser caches them.
