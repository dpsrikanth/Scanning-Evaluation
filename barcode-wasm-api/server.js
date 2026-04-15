import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import jpeg from "jpeg-js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const PORT = Number(process.env.PORT || 8787);
const PAGE_SERIAL_KEY = "pageserialno";
const LOG_LEVEL = String(process.env.LOG_LEVEL || "info").toLowerCase();
const JPEG_QUALITY = 78;
/** Max width/height passed to ZXing (inside fit); lowers WASM CPU time on large strips. */
const DECODE_MAX_EDGE = Math.max(512, Math.min(2048, Number(process.env.BARCODE_DECODE_MAX_EDGE || 1200)));

const BOTTOM_FRACTIONS = [0.1, 0.15, 0.2, 0.28, 0.4, 0.5];
const BOTTOM_FRACTIONS_UPSAMPLE = [0.15, 0.25, 0.4];

/** @type {"readBarcodes"|"readBarcode"|null} */
let zxingReaderKind = null;

/** @type {import("sharp").default | null | false} */
let sharpModule = undefined;

async function getSharp() {
  if (sharpModule === false) return null;
  if (sharpModule) return sharpModule;
  try {
    sharpModule = (await import("sharp")).default;
    return sharpModule;
  } catch {
    sharpModule = false;
    return null;
  }
}

function logInfo(msg, extra) {
  if (extra !== undefined) console.log(msg, extra);
  else console.log(msg);
}

function logDebug(msg, extra) {
  if (LOG_LEVEL !== "debug") return;
  if (extra !== undefined) console.log(`[debug] ${msg}`, extra);
  else console.log(`[debug] ${msg}`);
}

let zxingModulePromise = null;
async function loadZxingModule() {
  if (!zxingModulePromise) {
    zxingModulePromise = (async () => {
      try {
        const mod = await import("zxing-wasm");
        zxingReaderKind = typeof mod.readBarcodes === "function" ? "readBarcodes" : null;
        if (!zxingReaderKind && typeof mod.readBarcode === "function") zxingReaderKind = "readBarcode";
        logDebug("zxing-wasm import path", { entry: "zxing-wasm", reader: zxingReaderKind });
        return mod;
      } catch {
        const mod = await import("zxing-wasm/reader");
        zxingReaderKind = typeof mod.readBarcodes === "function" ? "readBarcodes" : "readBarcode";
        logDebug("zxing-wasm import path", { entry: "zxing-wasm/reader", reader: zxingReaderKind });
        return mod;
      }
    })();
  }
  return zxingModulePromise;
}

function cleanBase64(input) {
  if (!input || typeof input !== "string") return "";
  const idx = input.indexOf(",");
  const b64 = idx >= 0 ? input.slice(idx + 1) : input;
  return b64.trim();
}

/** Match desktop BarcodeService.IsLikelyPageNumberPayload */
function isLikelyPageNumberPayload(text) {
  if (!text) return false;
  const t = String(text).trim();
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    return n > 0 && n < 100000;
  }
  const parts = t.split("_").filter((p) => p.length > 0);
  if (parts.length === 0) return false;
  const m = parseInt(parts[parts.length - 1].trim(), 10);
  return !Number.isNaN(m) && m > 0;
}

function normalizeResults(rawResults) {
  const arr = Array.isArray(rawResults) ? rawResults : rawResults ? [rawResults] : [];
  return arr
    .map((r) => {
      const text = r?.text ?? r?.value ?? r?.rawValue ?? "";
      const format = r?.format ?? r?.barcodeFormat ?? r?.symbology ?? "";
      return { text: String(text || "").trim(), format: String(format || "") };
    })
    .filter((x) => x.text.length > 0);
}

async function decodeAll(imageBuffer) {
  const mod = await loadZxingModule();
  if (typeof mod.readBarcodes === "function") {
    const decoded = await mod.readBarcodes(imageBuffer);
    return normalizeResults(decoded);
  }
  if (typeof mod.readBarcode === "function") {
    const one = await mod.readBarcode(imageBuffer);
    return normalizeResults(one ? [one] : []);
  }
  throw new Error("zxing-wasm reader API not found");
}

function pickField(obj, ...keys) {
  for (const k of keys) {
    if (obj != null && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

/**
 * @param {unknown} raw
 * @returns {{ zoneName: string; pageScope: string; pageNumber: number; xPct: number; yPct: number; wPct: number; hPct: number } | null}
 */
function normalizeTemplateZone(raw) {
  if (!raw || typeof raw !== "object") return null;
  const z = raw;
  const zoneName = String(pickField(z, "ZoneName", "zoneName") ?? "").trim();
  if (!zoneName) return null;
  return {
    zoneName,
    pageScope: String(pickField(z, "PageScope", "pageScope") ?? "first").trim() || "first",
    pageNumber: Number(pickField(z, "PageNumber", "pageNumber") ?? 1) || 1,
    xPct: Number(pickField(z, "XPct", "xPct") ?? 0),
    yPct: Number(pickField(z, "YPct", "yPct") ?? 0),
    wPct: Number(pickField(z, "WPct", "wPct") ?? 0),
    hPct: Number(pickField(z, "HPct", "hPct") ?? 0),
  };
}

function isReservedPageSerialName(name) {
  if (!name || typeof name !== "string") return false;
  const n = name.trim();
  return n.toLowerCase() === PAGE_SERIAL_KEY || n.toLowerCase() === "pagevalno";
}

/** @param {string | null | undefined} zonesJson */
function parseZonesArray(zonesJson) {
  if (!zonesJson || typeof zonesJson !== "string" || !zonesJson.trim()) return null;
  try {
    const parsed = JSON.parse(zonesJson);
    if (!Array.isArray(parsed)) return null;
    return parsed.map(normalizeTemplateZone).filter(Boolean);
  } catch {
    return null;
  }
}

/** @param {ReturnType<parseZonesArray>} zones */
function findPageSerialZone(zones) {
  if (!zones) return null;
  for (const z of zones) {
    if (isReservedPageSerialName(z.zoneName)) return z;
  }
  return null;
}

/**
 * @param {NonNullable<ReturnType<findPageSerialZone>>} z
 * @param {number} pageNumber1Based
 * @param {number} barcodeStartPage1Based
 */
function shouldApplyPageSerialZone(z, pageNumber1Based, barcodeStartPage1Based) {
  if (!isReservedPageSerialName(z.zoneName)) return false;
  const start = Math.max(1, barcodeStartPage1Based);
  if (pageNumber1Based < start) return false;

  if (z.pageScope.toLowerCase() === "first") {
    if (isReservedPageSerialName(z.zoneName)) return pageNumber1Based >= start;
    return pageNumber1Based === 1;
  }

  const fromPg = z.pageNumber > 0 ? z.pageNumber : 1;
  const effectiveFrom = Math.max(start, fromPg);
  return pageNumber1Based >= effectiveFrom;
}

/**
 * @param {number} imgW
 * @param {number} imgH
 * @param {NonNullable<ReturnType<normalizeTemplateZone>>} z
 */
function zoneToRectangle(imgW, imgH, z) {
  const px = Math.round((imgW * z.xPct) / 100);
  const py = Math.round((imgH * z.yPct) / 100);
  const pw = Math.max(8, Math.round((imgW * z.wPct) / 100));
  const ph = Math.max(8, Math.round((imgH * z.hPct) / 100));
  return { left: px, top: py, width: pw, height: ph };
}

/**
 * @param {{ left: number; top: number; width: number; height: number }} rect
 * @param {number} iw
 * @param {number} ih
 */
function intersectRect(rect, iw, ih) {
  const left = Math.max(0, Math.min(rect.left, iw - 1));
  const top = Math.max(0, Math.min(rect.top, ih - 1));
  const width = Math.min(rect.width, iw - left);
  const height = Math.min(rect.height, ih - top);
  return { left, top, width, height };
}

/** @param {ReturnType<normalizeResults>} decoded */
function pickPageSerialFromDecoded(decoded) {
  const hit = decoded.find((d) => isLikelyPageNumberPayload(d.text));
  return hit?.text ?? null;
}

/** Bottom strip: stripH = max(32, floor(h * frac)), y0 = h - stripH */
function bottomStripRegion(imgW, imgH, frac) {
  const stripH = Math.max(32, Math.floor(imgH * frac));
  const y0 = Math.max(0, imgH - stripH);
  return { left: 0, top: y0, width: imgW, height: stripH };
}

function bottomStripRectText(imgW, imgH, frac) {
  const stripH = Math.max(32, Math.floor(imgH * frac));
  const y0 = Math.max(0, imgH - stripH);
  return `x=0 y=${y0} w=${imgW} h=${stripH}`;
}

/**
 * @param {Uint8Array} src
 * @param {number} srcW
 * @param {number} srcH
 */
function cropRgba(src, srcW, srcH, left, top, cw, ch) {
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const sy = top + y;
    if (sy < 0 || sy >= srcH) continue;
    const rowOut = y * cw * 4;
    const rowSrc = sy * srcW * 4;
    for (let x = 0; x < cw; x++) {
      const sx = left + x;
      if (sx < 0 || sx >= srcW) continue;
      const si = rowSrc + sx * 4;
      const di = rowOut + x * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return out;
}

/** Match desktop UpsampleNearest: dst = min(dim*2,8000), nearest-neighbor stretch. */
function upscaleNearest2x(rgba) {
  const { data, width, height } = rgba;
  const nw = Math.min(width * 2, 8000);
  const nh = Math.min(height * 2, 8000);
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(Math.floor((y * height) / nh), height - 1);
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(Math.floor((x * width) / nw), width - 1);
      const si = (sy * width + sx) * 4;
      const di = (y * nw + x) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  }
  return { width: nw, height: nh, data: out };
}

function decodeJpegToRgba(imageBuffer) {
  const decoded = jpeg.decode(imageBuffer, { useTArray: true, maxResolutionInMP: 64 });
  if (!decoded?.data || decoded.width < 4 || decoded.height < 4) {
    throw new Error("invalid or unsupported image (JPEG required for pageSerial crops)");
  }
  return { width: decoded.width, height: decoded.height, data: decoded.data };
}

function rgbaToJpegBuffer(rgba) {
  const enc = jpeg.encode(
    { data: rgba.data, width: rgba.width, height: rgba.height },
    JPEG_QUALITY
  );
  return Buffer.from(enc.data);
}

/**
 * @param {{ width: number; height: number; data: Uint8Array }} fullRgba
 * @param {{ left: number; top: number; width: number; height: number }} region
 * @param {boolean} scale2x
 */
function regionToJpegBufferFromRgba(fullRgba, region, scale2x) {
  const iw = fullRgba.width;
  const ih = fullRgba.height;
  const r = intersectRect(region, iw, ih);
  if (r.width < 4 || r.height < 4) return null;
  const cropped = cropRgba(fullRgba.data, iw, ih, r.left, r.top, r.width, r.height);
  let rgba = { width: r.width, height: r.height, data: cropped };
  if (scale2x) rgba = upscaleNearest2x(rgba);
  return rgbaToJpegBuffer(rgba);
}

/**
 * @param {import("sharp").default} Sh
 * @param {Buffer} imageBuffer
 * @param {{ left: number; top: number; width: number; height: number }} rect logical (may extend outside; intersected)
 * @param {number} iw
 * @param {number} ih
 * @param {boolean} scale2x
 */
async function regionToJpegBufferSharp(Sh, imageBuffer, rect, iw, ih, scale2x) {
  const r = intersectRect(rect, iw, ih);
  if (r.width < 4 || r.height < 4) return null;
  let pipe = Sh(imageBuffer, { failOn: "none" }).extract({
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
  });
  if (scale2x) {
    const nw = Math.min(r.width * 2, 8000);
    const nh = Math.min(r.height * 2, 8000);
    pipe = pipe.resize(nw, nh, { kernel: Sh.kernel.nearest, fit: "fill" });
  }
  pipe = pipe.resize({
    width: DECODE_MAX_EDGE,
    height: DECODE_MAX_EDGE,
    fit: "inside",
    withoutEnlargement: true,
    kernel: Sh.kernel.nearest,
  });
  return pipe.jpeg({ quality: JPEG_QUALITY, mozjpeg: true, effort: 2 }).toBuffer();
}

/** One ZXing pass with logging; returns hit or null. */
async function tryOneDecode(jpegBuf, label, rect, ctx) {
  if (!jpegBuf) return null;
  const t0 = Date.now();
  const decoded = await decodeAll(jpegBuf);
  const ms = Date.now() - t0;
  ctx.logAttempt(label, rect, decoded, ms);
  const val = pickPageSerialFromDecoded(decoded);
  if (!val) return null;
  return {
    barcodeValue: val,
    all: decoded,
    winnerLabel: label,
    winnerRect: rect,
    decodedCount: decoded.length,
  };
}

/**
 * @param {import("sharp").default} Sh
 * @param {Buffer} imageBuffer
 */
async function decodePageSerialSharp(Sh, imageBuffer, pageNumber1Based, barcodeStartPage1Based, zonesJson, ctx) {
  const meta = await Sh(imageBuffer, { failOn: "none" }).metadata();
  const iw = meta.width ?? 0;
  const ih = meta.height ?? 0;
  if (iw < 16 || ih < 16) {
    return {
      barcodeValue: null,
      all: [],
      winnerLabel: null,
      winnerRect: "too_small",
      decodedCount: 0,
    };
  }

  const zones = parseZonesArray(zonesJson);
  const zone = findPageSerialZone(zones);
  let all = /** @type {ReturnType<normalizeResults>} */ ([]);

  if (zone && shouldApplyPageSerialZone(zone, pageNumber1Based, barcodeStartPage1Based)) {
    const rect = zoneToRectangle(iw, ih, zone);
    const zr = intersectRect(rect, iw, ih);
    const rectStr = `x=${zr.left} y=${zr.top} w=${zr.width} h=${zr.height}`;
    const zonePct = `x=${zone.xPct} y=${zone.yPct} w=${zone.wPct} h=${zone.hPct}`;

    let hit = await tryOneDecode(
      await regionToJpegBufferSharp(Sh, imageBuffer, rect, iw, ih, false),
      "zone",
      rectStr,
      ctx
    );
    if (hit) return { ...hit, winnerRect: `${hit.winnerRect} | zone% ${zonePct}` };
    hit = await tryOneDecode(
      await regionToJpegBufferSharp(Sh, imageBuffer, rect, iw, ih, true),
      "zone-2x",
      rectStr,
      ctx
    );
    if (hit) return { ...hit, winnerRect: `${hit.winnerRect} | zone% ${zonePct}` };
  }

  for (const frac of BOTTOM_FRACTIONS) {
    const region = bottomStripRegion(iw, ih, frac);
    const rectStr = bottomStripRectText(iw, ih, frac);
    const hit = await tryOneDecode(
      await regionToJpegBufferSharp(Sh, imageBuffer, region, iw, ih, false),
      `bot-${frac}`,
      rectStr,
      ctx
    );
    if (hit) return hit;
  }

  for (const frac of BOTTOM_FRACTIONS_UPSAMPLE) {
    const region = bottomStripRegion(iw, ih, frac);
    const rectStr = bottomStripRectText(iw, ih, frac);
    const hit = await tryOneDecode(
      await regionToJpegBufferSharp(Sh, imageBuffer, region, iw, ih, true),
      `bot-${frac}-2x`,
      rectStr,
      ctx
    );
    if (hit) return hit;
  }

  return {
    barcodeValue: null,
    all,
    winnerLabel: null,
    winnerRect: "none",
    decodedCount: 0,
  };
}

/**
 * jpeg-js fallback (full decode) — slower; used when sharp is unavailable.
 * @param {{ width: number; height: number; data: Uint8Array }} fullRgba
 */
async function decodePageSerialJpegJs(fullRgba, pageNumber1Based, barcodeStartPage1Based, zonesJson, ctx) {
  const iw = fullRgba.width;
  const ih = fullRgba.height;
  if (iw < 16 || ih < 16) {
    return {
      barcodeValue: null,
      all: [],
      winnerLabel: null,
      winnerRect: "too_small",
      decodedCount: 0,
    };
  }

  const zones = parseZonesArray(zonesJson);
  const zone = findPageSerialZone(zones);
  let all = /** @type {ReturnType<normalizeResults>} */ ([]);

  if (zone && shouldApplyPageSerialZone(zone, pageNumber1Based, barcodeStartPage1Based)) {
    const rect = zoneToRectangle(iw, ih, zone);
    const zr = intersectRect(rect, iw, ih);
    const rectStr = `x=${zr.left} y=${zr.top} w=${zr.width} h=${zr.height}`;
    const zonePct = `x=${zone.xPct} y=${zone.yPct} w=${zone.wPct} h=${zone.hPct}`;
    let hit = await tryOneDecode(regionToJpegBufferFromRgba(fullRgba, rect, false), "zone", rectStr, ctx);
    if (hit) return { ...hit, winnerRect: `${hit.winnerRect} | zone% ${zonePct}` };
    hit = await tryOneDecode(regionToJpegBufferFromRgba(fullRgba, rect, true), "zone-2x", rectStr, ctx);
    if (hit) return { ...hit, winnerRect: `${hit.winnerRect} | zone% ${zonePct}` };
  }

  for (const frac of BOTTOM_FRACTIONS) {
    const region = bottomStripRegion(iw, ih, frac);
    const rectStr = bottomStripRectText(iw, ih, frac);
    const hit = await tryOneDecode(regionToJpegBufferFromRgba(fullRgba, region, false), `bot-${frac}`, rectStr, ctx);
    if (hit) return hit;
  }

  for (const frac of BOTTOM_FRACTIONS_UPSAMPLE) {
    const region = bottomStripRegion(iw, ih, frac);
    const rectStr = bottomStripRectText(iw, ih, frac);
    const hit = await tryOneDecode(regionToJpegBufferFromRgba(fullRgba, region, true), `bot-${frac}-2x`, rectStr, ctx);
    if (hit) return hit;
  }

  return { barcodeValue: null, all, winnerLabel: null, winnerRect: "none", decodedCount: 0 };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "barcode-wasm-api" });
});

app.post("/api/barcode/decode", async (req, res) => {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  const {
    imageBase64,
    mode = "pageSerial",
    pageNumber = null,
    barcodeStartPage = null,
    zonesJson = null,
  } = req.body || {};

  const clean = cleanBase64(imageBase64);
  if (!clean) {
    return res.status(400).json({ ok: false, error: "imageBase64 is required" });
  }

  const attempts = [];

  function logAttempt(label, rect, decoded, ms) {
    attempts.push({ label, rect, count: decoded.length, ms });
    if (LOG_LEVEL !== "debug") return;
    const preview = decoded
      .slice(0, 5)
      .map((d) => `${d.format}:${d.text.length > 40 ? `${d.text.slice(0, 40)}…` : d.text}`);
    logDebug(`decode attempt [${requestId}]`, { label, rect, ms, count: decoded.length, preview });
  }

  try {
    const imageBuffer = Buffer.from(clean, "base64");

    logInfo(
      `[${requestId}] decode start mode=${mode} bytes=${imageBuffer.length} zonesJson=${zonesJson ? `yes(len=${zonesJson.length})` : "no"}`
    );

    let barcodeValue = null;
    let linearText = null;
    let qrText = null;
    /** @type {ReturnType<normalizeResults>} */
    let decoded = [];
    let winnerLabel = null;
    let winnerRect = "x=0 y=0 w=full h=full";
    let decodedCount = 0;

    const pageNum = pageNumber != null ? Number(pageNumber) : 1;
    const barcodeStart = barcodeStartPage != null ? Number(barcodeStartPage) : 1;

    const Sh = await getSharp();

    if (mode === "pageSerial") {
      if (Sh) {
        const out = await decodePageSerialSharp(
          Sh,
          imageBuffer,
          Number.isFinite(pageNum) ? pageNum : 1,
          Number.isFinite(barcodeStart) ? barcodeStart : 1,
          zonesJson,
          { requestId, logAttempt }
        );
        barcodeValue = out.barcodeValue;
        decoded = out.all;
        winnerLabel = out.winnerLabel;
        winnerRect = out.winnerRect;
        decodedCount = out.decodedCount;
      } else {
        logInfo(`[${requestId}] pipeline=jpeg-js (sharp unavailable)`);
        const fullRgba = decodeJpegToRgba(imageBuffer);
        const out = await decodePageSerialJpegJs(
          fullRgba,
          Number.isFinite(pageNum) ? pageNum : 1,
          Number.isFinite(barcodeStart) ? barcodeStart : 1,
          zonesJson,
          { requestId, logAttempt }
        );
        barcodeValue = out.barcodeValue;
        decoded = out.all;
        winnerLabel = out.winnerLabel;
        winnerRect = out.winnerRect;
        decodedCount = out.decodedCount;
      }
    } else {
      const t0 = Date.now();
      if (Sh) {
        const small = await Sh(imageBuffer, { failOn: "none" })
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
            kernel: Sh.kernel.nearest,
          })
          .jpeg({ quality: JPEG_QUALITY, mozjpeg: true, effort: 2 })
          .toBuffer();
        decoded = await decodeAll(small);
      } else {
        decoded = await decodeAll(imageBuffer);
      }
      decodedCount = decoded.length;
      logAttempt("full", winnerRect, decoded, Date.now() - t0);
      for (const d of decoded) {
        if (!qrText && d.format.toLowerCase().includes("qr")) qrText = d.text;
        else if (!linearText) linearText = d.text;
      }
    }

    const elapsedMs = Date.now() - started;
    const diag = [
      `key=${PAGE_SERIAL_KEY}`,
      `mode=${mode}`,
      winnerLabel ? `winner=${winnerLabel}` : "winner=-",
      `imagePos=${winnerRect}`,
      `decodedCount=${decodedCount}`,
      `pageNumber=${pageNumber ?? "-"}`,
      `barcodeStartPage=${barcodeStartPage ?? "-"}`,
      `zonesJsonPresent=${zonesJson ? "yes" : "no"}`,
      `attempts=${attempts.length}`,
      `pipeline=${Sh ? "sharp" : "jpeg-js"}`,
      `maxEdge=${DECODE_MAX_EDGE}`,
      `elapsedMs=${elapsedMs}`,
    ].join(" | ");

    logInfo(`[${requestId}] decode done`, {
      winner: winnerLabel,
      barcodeValue: barcodeValue ?? linearText ?? qrText ?? null,
      elapsedMs,
      zxingReader: zxingReaderKind,
    });

    return res.json({
      ok: true,
      barcodeValue,
      linearText,
      qrText,
      diag,
      all: decoded,
    });
  } catch (err) {
    if (LOG_LEVEL === "debug" && err?.stack) logDebug("decode error stack", err.stack);
    else logInfo(`[${requestId}] decode error`, err?.message || err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "decode failed",
      diag: `key=${PAGE_SERIAL_KEY} | mode=${mode} | imagePos=x=0 y=0 w=full h=full | decodeError=yes`,
    });
  }
});

app.listen(PORT, () => {
  logInfo(`barcode-wasm-api listening on http://localhost:${PORT} LOG_LEVEL=${LOG_LEVEL} BARCODE_DECODE_MAX_EDGE=${DECODE_MAX_EDGE}`);
  loadZxingModule().catch(() => {});
});
