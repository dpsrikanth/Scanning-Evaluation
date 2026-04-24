from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

FaceMethod = Literal["opencv", "mediapipe", "retinaface", "mtcnn", "face_recognition"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    host: str = "0.0.0.0"
    port: int = 8050
    # Which backend is used by default; can be overridden per request
    face_method: FaceMethod = "opencv"
    # DeepFace model: Facenet, VGG-Face, OpenFace, DeepID, Dlib, ArcFace, SFace, GhostFaceNet
    deepface_model: str = "Facenet"
    face_recognition_tolerance: float = 0.6
    # Cosine / L2 for DeepFace; cosine is typical for Facenet
    deepface_distance_metric: str = "cosine"
    # Log timings
    log_detail: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
