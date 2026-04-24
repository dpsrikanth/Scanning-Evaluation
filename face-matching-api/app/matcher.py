from __future__ import annotations

import time
from typing import Any, Optional, Tuple

import numpy as np

from app.config import FaceMethod, Settings, get_settings
from app.decode import b64_to_rgb_ndarray
from app.schemas import FaceMatchResponse

# Lazy imports inside functions to allow API to start with partial deps and return clear errors

DEEPFACE_BACKENDS: dict[str, str] = {
    "opencv": "opencv",
    "mediapipe": "mediapipe",
    "retinaface": "retinaface",
    "mtcnn": "mtcnn",
}


def _distance_to_scores(distance: float, threshold: float) -> tuple[float, float]:
    """Map distance + model threshold to match_percentage 0-100 and confidence 0-1."""
    t = max(float(threshold) or 0.1, 1e-6)
    d = float(distance)
    # Lower distance = better match. At d=0 -> 100%; at d>=2t -> 0% (tunable)
    cap = 2.0 * t
    pct = 100.0 * max(0.0, min(1.0, 1.0 - d / cap))
    conf = max(0.0, min(1.0, 1.0 - d / cap))
    return round(pct, 2), round(conf, 4)


def _count_faces_deepface(img: np.ndarray, backend: str) -> int:
    from deepface import DeepFace

    try:
        faces = DeepFace.extract_faces(
            img,
            detector_backend=backend,
            enforce_detection=False,
        )
        if not faces:
            return 0
        return len(faces)
    except Exception:
        return 0


def _match_face_recognition(ref: np.ndarray, cmp: np.ndarray, settings: Settings) -> Tuple[dict[str, Any], int, int]:
    import face_recognition

    loc_ref = face_recognition.face_locations(ref, model="hog")
    loc_cmp = face_recognition.face_locations(cmp, model="hog")
    n_ref = len(loc_ref)
    n_cmp = len(loc_cmp)

    if n_ref < 1 or n_cmp < 1:
        return {
            "match": False,
            "reason": "no_face",
            "n_ref": n_ref,
            "n_cmp": n_cmp,
        }, n_ref, n_cmp

    enc_ref = face_recognition.face_encodings(ref, known_face_locations=loc_ref)
    enc_cmp = face_recognition.face_encodings(cmp, known_face_locations=loc_cmp)
    if not enc_ref or not enc_cmp:
        return {
            "match": False,
            "reason": "no_encoding",
            "n_ref": n_ref,
            "n_cmp": n_cmp,
        }, n_ref, n_cmp

    # Compare primary (largest) face: use first in list
    d = float(face_recognition.face_distance([enc_ref[0]], enc_cmp[0])[0])
    tol = float(settings.face_recognition_tolerance)
    match = d < tol
    return {
        "match": match,
        "distance": d,
        "threshold": tol,
        "n_ref": n_ref,
        "n_cmp": n_cmp,
    }, n_ref, n_cmp


def run_face_match(
    actual_b64: str, compare_b64: str, method: Optional[FaceMethod] = None
) -> FaceMatchResponse:
    settings = get_settings()
    t0 = time.perf_counter()
    method = method or settings.face_method
    valid = ("opencv", "mediapipe", "retinaface", "mtcnn", "face_recognition")
    if method is None or method not in valid:
        return FaceMatchResponse(
            success=False,
            success_flag=False,
            method=str(method),
            message="Invalid face method.",
            error=f"Invalid FACE_METHOD; use one of: {', '.join(valid)}",
        )

    try:
        ref = b64_to_rgb_ndarray(actual_b64)
        cmp = b64_to_rgb_ndarray(compare_b64)
    except Exception as e:
        return FaceMatchResponse(
            success=False,
            success_flag=False,
            method=method,
            message="Could not read one or both images. Send valid base64 (PNG/JPEG).",
            error=str(e)[:2000],
        )

    if method == "face_recognition":
        try:
            out, n_ref, n_cmp = _match_face_recognition(ref, cmp, settings)
        except ImportError as e:
            return FaceMatchResponse(
                success=False,
                success_flag=False,
                method=method,
                message="The face_recognition backend requires the `face_recognition` and `dlib` packages.",
                error=str(e)[:2000],
            )
        except Exception as e:
            return FaceMatchResponse(
                success=True,
                success_flag=False,
                method=method,
                face_count_reference=n_ref,
                face_count_compare=n_cmp,
                message=f"Face recognition failed: {e!s}",
                error=str(e)[:2000],
                processing_time_ms=round((time.perf_counter() - t0) * 1000, 2),
            )

        if out.get("reason") in ("no_face", "no_encoding"):
            return FaceMatchResponse(
                success=True,
                success_flag=False,
                method=method,
                face_count_reference=n_ref,
                face_count_compare=n_cmp,
                match_percentage=0.0,
                confidence=0.0,
                message="At least one image must contain a clear, detectable face for encoding."
                if out.get("reason") == "no_encoding"
                else "At least one image must contain a detectable face.",
                details={"reason": out.get("reason")},
                processing_time_ms=round((time.perf_counter() - t0) * 1000, 2),
            )

        d = out["distance"]
        t = out["threshold"]
        pct, conf = _distance_to_scores(d, t)
        if not out.get("match"):
            pct = min(pct, 50.0)
        msg = "Faces match the same person." if out["match"] else "Faces do not match or similarity is too low."
        return FaceMatchResponse(
            success=True,
            success_flag=bool(out["match"]),
            method=method,
            face_count_reference=n_ref,
            face_count_compare=n_cmp,
            match_percentage=pct if out["match"] else min(pct, 99.0),
            confidence=conf if not out["match"] else max(conf, 0.85),
            distance=d,
            threshold=t,
            message=msg,
            model_name="dlib+face_recognition",
            details={"tolerance": t},
            processing_time_ms=round((time.perf_counter() - t0) * 1000, 2),
        )

    # DeepFace path (opencv, mediapipe, retinaface, mtcnn)
    from deepface import DeepFace

    backend = DEEPFACE_BACKENDS[method]
    n_ref = _count_faces_deepface(ref, backend)
    n_cmp = _count_faces_deepface(cmp, backend)
    try:
        verify = DeepFace.verify(
            img1_path=ref,
            img2_path=cmp,
            model_name=settings.deepface_model,
            distance_metric=settings.deepface_distance_metric,
            detector_backend=backend,
            enforce_detection=True,
        )
    except ImportError as e:
        return FaceMatchResponse(
            success=False,
            success_flag=False,
            method=method,
            message="DeepFace (and its TensorFlow dependency) is required. Install with requirements.txt.",
            error=str(e)[:2000],
        )
    except Exception as e:
        err = str(e)
        low = err.lower()
        if "face could not be detected" in low or "could not be detected" in low or "face not found" in low:
            return FaceMatchResponse(
                success=True,
                success_flag=False,
                method=method,
                face_count_reference=n_ref,
                face_count_compare=n_cmp,
                message="A face could not be detected in one of the images. Use a clearer, front-facing photo.",
                error=err[:2000],
                details={"detector": DEEPFACE_BACKENDS[method]},
                processing_time_ms=round((time.perf_counter() - t0) * 1000, 2),
            )
        return FaceMatchResponse(
            success=True,
            success_flag=False,
            method=method,
            face_count_reference=n_ref,
            face_count_compare=n_cmp,
            message=f"Matching failed: {err[:200]}",
            error=err[:2000],
            processing_time_ms=round((time.perf_counter() - t0) * 1000, 2),
        )

    verified = bool(verify.get("verified"))
    distance = float(verify.get("distance", 0) or 0)
    threshold = float(verify.get("threshold", 0) or 0.4)
    pct, conf = _distance_to_scores(distance, threshold)
    if verified:
        pct = max(pct, 80.0)
        conf = max(conf, 0.75)

    msg = "Faces match the same person." if verified else "Faces do not match the same person for this model."
    return FaceMatchResponse(
        success=True,
        success_flag=verified,
        method=method,
        face_count_reference=n_ref,
        face_count_compare=n_cmp,
        match_percentage=round(pct, 2),
        confidence=round(float(conf), 4),
        distance=distance,
        threshold=threshold,
        message=msg,
        model_name=str(verify.get("model", settings.deepface_model)),
        details={k: v for k, v in verify.items() if k not in ("verified", "distance", "threshold")},
        processing_time_ms=round((time.perf_counter() - t0) * 1000, 2),
    )
