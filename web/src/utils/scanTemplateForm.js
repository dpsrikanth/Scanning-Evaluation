/** Shared scan template form model + API payload (matches scanadmin.repository). */

export const SCANNER_BLANK_ZONE = {
  zoneName: '',
  pageScope: 'first',
  pageNumber: 1,
  xPct: 0,
  yPct: 85,
  wPct: 100,
  hPct: 12,
  hint: 'ANY',
};

export const SCANNER_BLANK_TPL = {
  templateName: '',
  description: '',
  pageCount: 24,
  dpi: 300,
  colorMode: 'Grayscale',
  pageSize: 'A4',
  duplexMode: 'Simplex',
  jpegQuality: 85,
  brightnessAdj: 128,
  contrastAdj: 128,
  threshold: 128,
  pdfJpegQuality: 70,
  pdfMaxDpi: 150,
  skipBlankPages: false,
  deSkew: true,
  isActive: 1,
  pdfFilenameFormat: '',
  barcodeStartPage: 3,
  barcodeZonesJson: [],
  uploadScheduleMode: 'immediate',
  uploadScheduleParam: '',
};

export const PDF_PRESETS = [
  { label: 'Archive - original quality (~14 MB / 42 pages)', pdfJpegQuality: 85, pdfMaxDpi: 0 },
  { label: 'High - 200 DPI / 75% quality (~6 MB / 42 pages)', pdfJpegQuality: 75, pdfMaxDpi: 200 },
  { label: 'Standard - 150 DPI / 70% quality (~3 MB / 42 pages)', pdfJpegQuality: 70, pdfMaxDpi: 150 },
  { label: 'Small - 150 DPI / 60% quality (~2 MB / 42 pages)', pdfJpegQuality: 60, pdfMaxDpi: 150 },
];

export function parseZonesFromApi(v) {
  if (Array.isArray(v)) return v.map(normalizeZoneRow);
  if (typeof v === 'string' && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map(normalizeZoneRow) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function normalizeZoneRow(z) {
  return {
    zoneName: z.zoneName || z.ZoneName || '',
    pageScope: z.pageScope || z.PageScope || 'first',
    pageNumber: Number(z.pageNumber ?? z.PageNumber ?? 1) || 1,
    xPct: Number(z.xPct ?? z.XPct ?? 0) || 0,
    yPct: Number(z.yPct ?? z.YPct ?? 0) || 0,
    wPct: Number(z.wPct ?? z.WPct ?? 15) || 0,
    hPct: Number(z.hPct ?? z.HPct ?? 8) || 0,
    hint: z.hint || z.Hint || 'ANY',
  };
}

export function templateRowToForm(t) {
  return {
    templateName: t.TemplateName,
    description: t.Description ?? '',
    pageCount: t.PageCount,
    dpi: t.DPI,
    colorMode: t.ColorMode,
    pageSize: t.PageSize,
    duplexMode: t.DuplexMode,
    jpegQuality: t.JpegQuality,
    brightnessAdj: t.BrightnessAdj ?? 128,
    contrastAdj: t.ContrastAdj ?? 128,
    threshold: t.Threshold ?? 128,
    pdfJpegQuality: t.PdfJpegQuality ?? 70,
    pdfMaxDpi: t.PdfMaxDpi ?? 150,
    skipBlankPages: !!t.SkipBlankPages,
    deSkew: t.DeSkew !== false,
    isActive: t.IsActive,
    TemplateID: t.TemplateID,
    pdfFilenameFormat: t.PdfFilenameFormat || '',
    barcodeStartPage: t.BarcodeStartPage ?? 3,
    barcodeZonesJson: parseZonesFromApi(t.BarcodeZonesJson),
    uploadScheduleMode: t.UploadScheduleMode || 'immediate',
    uploadScheduleParam: t.UploadScheduleParam || '',
  };
}

/** ZonePicker uses 0–1 fractions and `name`; form uses % and zoneName. */
export function barcodeZonesJsonToPickerZones(rows) {
  return (rows || []).map((z) => ({
    name: z.zoneName || '',
    pageScope: z.pageScope === 'fromPage' ? 'FromPage' : 'FirstPage',
    pageScopeValue: z.pageNumber ?? 1,
    x: (Number(z.xPct) || 0) / 100,
    y: (Number(z.yPct) || 0) / 100,
    w: (Number(z.wPct) || 0) / 100,
    h: (Number(z.hPct) || 0) / 100,
    hint: z.hint || 'ANY',
  }));
}

export function pickerZonesToBarcodeZonesJson(zones) {
  return (zones || [])
    .map((z) => ({
      zoneName: String(z.name || '').trim(),
      pageScope: z.pageScope === 'FromPage' || z.pageScope === 'fromPage' ? 'fromPage' : 'first',
      pageNumber: Math.max(1, parseInt(z.pageScopeValue, 10) || 1),
      xPct: Math.round((Number(z.x) || 0) * 10000) / 100,
      yPct: Math.round((Number(z.y) || 0) * 10000) / 100,
      wPct: Math.round((Number(z.w) || 0) * 10000) / 100,
      hPct: Math.round((Number(z.h) || 0) * 10000) / 100,
      hint: z.hint || 'ANY',
    }))
    .filter((z) => z.zoneName);
}

export function buildTemplatePayload(data) {
  const rawZones = data.barcodeZonesJson;
  let barcodeZonesJson = null;
  if (Array.isArray(rawZones) && rawZones.length > 0) {
    const mapped = rawZones
      .map((z) => ({
        zoneName: String(z.zoneName || '').trim(),
        pageScope: z.pageScope === 'fromPage' ? 'fromPage' : 'first',
        pageNumber: Math.max(1, parseInt(z.pageNumber, 10) || 1),
        xPct: Number(z.xPct) || 0,
        yPct: Number(z.yPct) || 0,
        wPct: Number(z.wPct) || 0,
        hPct: Number(z.hPct) || 0,
        hint: String(z.hint || 'ANY').trim() || 'ANY',
      }))
      .filter((z) => z.zoneName);
    if (mapped.length > 0) barcodeZonesJson = mapped;
  }
  const templateName = String(data.templateName || '').trim();
  if (!templateName) {
    return { error: 'Template name is required.', payload: null };
  }
  const payload = {
    templateName,
    description: data.description || '',
    pageCount: parseInt(data.pageCount, 10) || 24,
    dpi: parseInt(data.dpi, 10) || 300,
    colorMode: data.colorMode || 'Grayscale',
    pageSize: data.pageSize || 'A4',
    duplexMode: data.duplexMode || 'Simplex',
    jpegQuality: Number.isFinite(parseInt(data.jpegQuality, 10)) ? parseInt(data.jpegQuality, 10) : 85,
    brightnessAdj: Number.isFinite(parseInt(data.brightnessAdj, 10)) ? parseInt(data.brightnessAdj, 10) : 128,
    contrastAdj: Number.isFinite(parseInt(data.contrastAdj, 10)) ? parseInt(data.contrastAdj, 10) : 128,
    threshold: Number.isFinite(parseInt(data.threshold, 10)) ? parseInt(data.threshold, 10) : 128,
    pdfJpegQuality: Number.isFinite(parseInt(data.pdfJpegQuality, 10)) ? parseInt(data.pdfJpegQuality, 10) : 70,
    pdfMaxDpi: Number.isFinite(parseInt(data.pdfMaxDpi, 10)) ? parseInt(data.pdfMaxDpi, 10) : 0,
    skipBlankPages: !!data.skipBlankPages,
    deSkew: data.deSkew !== false,
    pdfFilenameFormat: data.pdfFilenameFormat?.trim() || null,
    barcodeStartPage: Math.max(1, parseInt(data.barcodeStartPage, 10) || 3),
    barcodeZonesJson,
    uploadScheduleMode: data.uploadScheduleMode || 'immediate',
    uploadScheduleParam: data.uploadScheduleParam?.trim() || null,
    isActive: data.isActive ?? 1,
  };
  return { error: null, payload };
}
