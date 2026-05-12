# Barcode WASM API

Separate barcode decode application using `zxing-wasm` plus a **fast crop pipeline** so `pageSerial` matches the desktop scanner: **only the bottom-right quarter** of the page (split in half horizontally and vertically) is decoded, with optional 2× upscale—template `zonesJson` and legacy bottom-strip passes are **ignored** for page serial (same as `BarcodeService.ReadPageSerialOrFooterWithDiag` in scanner-desktop).

**Performance (default):** [sharp](https://sharp.pixelplumbing.com/) extracts JPEG regions without decoding the full page to RGB in JavaScript; each crop is optionally upscaled, then **downscaled to fit inside `BARCODE_DECODE_MAX_EDGE`** (default `1200`) before ZXing, which keeps WASM CPU time low. Crops are tried **in order with early exit** on first good page-serial payload (no redundant decodes). If `sharp` fails to load, the server falls back to `jpeg-js` (slower).

**Tuning:** `BARCODE_DECODE_MAX_EDGE` — lower (e.g. `960`) for speed, higher (e.g. `1600`) if hard pages miss reads. `LOG_LEVEL=debug` logs per-attempt timings.

## Run

```bash
cd barcode-wasm-api
npm install
npm start
```

If `npm install` fails with `ECONNRESET` against `registry.npmjs.org`, retry with another registry (example):

```bash
npm install --registry https://registry.npmmirror.com
```

Default port: `8787` (override with `PORT`).

### Logging

- **`LOG_LEVEL=info`** (default): one line per request (request id, mode, byte size, JPEG dimensions for `pageSerial`, summary).
- **`LOG_LEVEL=debug`**: each decode attempt (crop label, rectangle, timing, truncated symbol preview), zxing entrypoint on first load, and error stacks on 500.

Windows PowerShell:

```powershell
$env:LOG_LEVEL = "debug"
npm start
```

Health endpoint:

`GET /health`

Decode endpoint:

`POST /api/barcode/decode`

Request JSON:

```json
{
  "imageBase64": "<base64 image or data-url>",
  "mode": "pageSerial",
  "pageNumber": 5,
  "barcodeStartPage": 3,
  "zonesJson": "[...]"
}
```

Response JSON:

```json
{
  "ok": true,
  "barcodeValue": "15",
  "linearText": null,
  "qrText": null,
  "diag": "key=pageserialno | ...",
  "all": [
    { "text": "15", "format": "Code128" }
  ]
}
```

`mode` values:
- `pageSerial` -> returns `barcodeValue` (expects **JPEG** input so the server can decode and crop; the desktop client sends JPEG.)
- `linearQr` -> returns `linearText` + `qrText` (full image; JPEG or formats `zxing-wasm` accepts)

The `diag` field includes `winner=…` when a crop succeeds (`br-q`, `br-q-2x`), `imagePos=…` for that crop, `attempts=N` (ZXing passes actually run), `pipeline=sharp|jpeg-js`, `maxEdge=…`, and `elapsedMs`. `zonesJson` may still be sent by the client but is not used for `pageSerial` cropping.

