# Download face-api.js model files into this folder (required for face detection in user registration).
# Run from this directory: .\download-face-models.ps1
# Or from repo root: .\web\public\face-api-models\download-face-models.ps1

$Base = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights"
$Files = @(
    "tiny_face_detector_model-shard1",
    "tiny_face_detector_model-weights_manifest.json",
    "face_landmark_68_tiny_model-shard1",
    "face_landmark_68_tiny_model-weights_manifest.json",
    "face_recognition_model-shard1",
    "face_recognition_model-shard2",
    "face_recognition_model-weights_manifest.json"
)

$TargetDir = $PSScriptRoot
if (-not (Test-Path $TargetDir)) { New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null }

foreach ($f in $Files) {
    $url = "$Base/$f"
    $out = Join-Path $TargetDir $f
    Write-Host "Downloading $f ..."
    try {
        Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
        Write-Host "  OK"
    } catch {
        Write-Host "  FAILED: $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Done. Restart the web dev server (npm run dev) and try the photo upload again." -ForegroundColor Green
