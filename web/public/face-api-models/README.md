# Face API Models

Face detection (e.g. when creating an Evaluator user) needs these model weight files in **this folder**. Without them you get: *"Face check failed: Unexpected token '<', \"<!DOCTYPE\"... is not valid JSON"* — because the app requests the models and receives the app’s HTML instead.

## Quick fix (Windows PowerShell)

From this directory run:

```powershell
.\download-face-models.ps1
```

Or from the repo root:

```powershell
.\web\public\face-api-models\download-face-models.ps1
```

Then restart the web dev server (`npm run dev`) and try again.

## Required files (face-api.js @0.22.2)

| File |
|------|
| `tiny_face_detector_model-shard1` |
| `tiny_face_detector_model-weights_manifest.json` |
| `face_landmark_68_tiny_model-shard1` |
| `face_landmark_68_tiny_model-weights_manifest.json` |
| `face_recognition_model-shard1` |
| `face_recognition_model-shard2` |
| `face_recognition_model-weights_manifest.json` |

Source: [justadudewhohacks/face-api.js](https://github.com/justadudewhohacks/face-api.js) via [jsDelivr CDN](https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights/).

## Manual download

If the script fails, download each file from:

`https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights/<filename>`

and save it into `web/public/face-api-models/` (this folder).

## After adding the files

Restart the Vite dev server so it serves the new files. Face detection will then run when you upload or capture a photo for an Evaluator.
