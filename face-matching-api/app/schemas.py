from typing import Any, Literal, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

FaceMethod = Literal["opencv", "mediapipe", "retinaface", "mtcnn", "face_recognition"]


class FaceMatchRequest(BaseModel):
    """Reference image vs image to compare (both base64-encoded, with or without data URL prefix)."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    actual_image_base64: str = Field(
        ...,
        validation_alias=AliasChoices("actual_image_base64", "actual_base64_image", "actual"),
        description="Reference / registered image (base64)",
    )
    tobecompared_image_base64: str = Field(
        ...,
        validation_alias=AliasChoices(
            "tobecompared_image_base64",
            "tobecompared",
            "tobecompared_base64",
            "compare_image_base64",
        ),
        description="Image to verify: live capture or new sample (base64)",
    )
    method: Optional[FaceMethod] = Field(
        None,
        description="Override FACE_METHOD for this call; if omitted, server default is used.",
    )


class FaceMatchResponse(BaseModel):
    success: bool = Field(..., description="True if the request was processed (no internal/parsing failure).")
    success_flag: bool = Field(
        ...,
        description="True if the two faces are considered a match (same identity) for the configured threshold.",
    )
    method: str = Field(..., description="Backend that was used (opencv, mediapipe, retinaface, mtcnn, face_recognition).")
    face_count_reference: int = Field(0, ge=0, description="Number of faces detected in the reference image.")
    face_count_compare: int = Field(0, ge=0, description="Number of faces detected in the compare image.")
    match_percentage: float = Field(0.0, ge=0.0, le=100.0, description="Similarity score as a percentage (model-specific).")
    confidence: float = Field(0.0, ge=0.0, le=1.0, description="Model confidence 0..1 (derived from distance vs threshold).")
    distance: Optional[float] = Field(None, description="Raw distance (DeepFace) or L2 (face_recognition) when available.")
    threshold: Optional[float] = Field(None, description="Distance threshold used for the decision, when available.")
    message: str = Field("", description="User-facing message.")
    model_name: Optional[str] = None
    details: dict[str, Any] = Field(default_factory=dict, description="Extra fields (e.g. detector_backend, verified).")
    error: Optional[str] = None
    processing_time_ms: Optional[float] = None
