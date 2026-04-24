from __future__ import annotations

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.matcher import run_face_match
from app.schemas import FaceMatchRequest, FaceMatchResponse

app = FastAPI(
    title="Face matching service",
    description="Compare two face images (base64). Backends: opencv, mediapipe, retinaface, mtcnn, face_recognition (dlib).",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "face-matching-api"}


@app.get("/facematch/methods")
def list_methods() -> dict:
    s = get_settings()
    return {
        "default_method": s.face_method,
        "options": [
            "opencv",
            "mediapipe",
            "retinaface",
            "mtcnn",
            "face_recognition",
        ],
        "note": "opencv–mtcnn+retinaface+mediapipe use DeepFace+TensorFlow; face_recognition uses dlib+face_recognition package.",
    }


@app.post("/facematch", response_model=FaceMatchResponse)
def facematch(body: FaceMatchRequest) -> FaceMatchResponse:
    """
    Compare **actual** (reference) image to **tobecompared** image.
    Server uses `FACE_METHOD` unless `method` is set in the JSON body.
    """
    return run_face_match(
        body.actual_image_base64,
        body.tobecompared_image_base64,
        body.method,
    )


def run() -> None:
    s = get_settings()
    uvicorn.run("app.main:app", host=s.host, port=s.port, reload=False)


if __name__ == "__main__":
    run()
