import base64
import re
from io import BytesIO

import numpy as np
from PIL import Image


def strip_data_url(b64: str) -> str:
    s = (b64 or "").strip()
    if s.startswith("data:"):
        m = re.search(r"base64,(.+)$", s, re.DOTALL)
        if m:
            return m.group(1).strip()
    return s


def b64_to_rgb_ndarray(b64: str) -> np.ndarray:
    """Decode image to HxWx3 uint8 RGB."""
    raw = strip_data_url(b64)
    if not raw:
        raise ValueError("Empty image payload")
    # Padding and URL-safe clients vary; be lenient
    data = base64.b64decode(raw, validate=False)
    img = Image.open(BytesIO(data)).convert("RGB")
    return np.array(img, dtype=np.uint8)
