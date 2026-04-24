# Face matching API (Python)

Standalone **FastAPI** service that compares two face images (base64) and returns a detailed JSON result. The active backend is selected by **`FACE_METHOD`** (or per-request `method`).

| `FACE_METHOD`       | Stack |
|---------------------|--------|
| `opencv`            | DeepFace + OpenCV face detector + embedding model (see `DEEPFACE_MODEL`) |
| `mediapipe`         | DeepFace + MediaPipe detector |
| `mtcnn`             | DeepFace + MTCNN |
| `retinaface`        | DeepFace + RetinaFace |
| `face_recognition`  | **`face_recognition` + dlib** (no TensorFlow; install `dlib` + `face-recognition` separately) |

## Quick start

```bash
cd face-matching-api
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
# Optional, for the "face_recognition" method (after dlib is available):
# pip install face-recognition
copy .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8050
```

- Docs: <http://localhost:8050/docs>  
- Health: `GET /health`  
- List backends: `GET /facematch/methods`

## `POST /facematch`

**Body (JSON)** — field names are flexible:

| Field | Aliases (also accepted) |
|-------|-------------------------|
| `actual_image_base64` | `actual_base64_image`, `actual` |
| `tobecompared_image_base64` | `tobecompared`, `tobecompared_base64`, `compare_image_base64` |
| `method` (optional) | `opencv` \| `mediapipe` \| `retinaface` \| `mtcnn` \| `face_recognition` |

Images may be raw base64 or `data:image/jpeg;base64,...`.

**Example response**

```json
{
  "success": true,
  "success_flag": true,
  "method": "opencv",
  "face_count_reference": 1,
  "face_count_compare": 1,
  "match_percentage": 92.4,
  "confidence": 0.8812,
  "distance": 0.12,
  "threshold": 0.4,
  "message": "Faces match the same person.",
  "model_name": "Facenet",
  "details": { },
  "error": null,
  "processing_time_ms": 842.1
}
```

- **`success`**: request handled without a top-level server failure (image decoded, pipeline ran).  
- **`success_flag`**: the model considers the two faces the **same person** (for the configured distance/threshold).  
- **`match_percentage` / `confidence`**: derived from model distance and threshold (not a universal cross-model percentage).  
- **`face_count_*`**: approximate face counts from the same detector (where supported).

## Configuration

Environment variables (see `.env.example`) are loaded via `pydantic-settings`. Override the default method per call with the JSON `method` field.

## Windows: `dlib` / `face-recognition`

`pip install dlib` often fails on Windows. Prefer **Conda** (`conda install dlib -c conda-forge`) or a [prebuilt wheel](https://github.com/sachadee/dlib) matching your Python version, then `pip install face-recognition`. Without this, the **`face_recognition`** method is unavailable; the other four methods use **TensorFlow + DeepFace** only.

## Integrating with the Node app

1. Run this service on a port (e.g. `8050`).  
2. From the Node API, `POST` to `http://localhost:8050/facematch` with the same JSON when you need server-side face match (e.g. evaluator login or random evaluation checks).  
3. Set `success_flag` and/or minimum `match_percentage` / `confidence` according to your policy.

## Notes

- First DeepFace/TensorFlow import can be slow.  
- GPU optional; CPU works for moderate traffic.  
- For production, put the app behind a reverse proxy, TLS, and auth.



Option A — activate, then run

.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8050
Option B — no activate (explicit venv Python)

.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8050
If you ever need to install deps again without activating:

.\.venv\Scripts\python.exe -m pip install -r requirements.txt
If the venv had no pip:

.\.venv\Scripts\python.exe -m ensurepip --upgrade
Summary: Always run Uvicorn (and pip) from the .venv after cd face-matching-api, not from C:\Python312\Scripts\..., so imports like fastapi resolve correctly.