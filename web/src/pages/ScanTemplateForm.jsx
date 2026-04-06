import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { api } from '../services/api';
import ZonePicker from '../components/ZonePicker';
import { configurePdfWorker, renderPageToDataUrl } from '../utils/pdfBooklet';
import {
  SCANNER_BLANK_TPL,
  SCANNER_BLANK_ZONE,
  PDF_PRESETS,
  templateRowToForm,
  buildTemplatePayload,
  barcodeZonesJsonToPickerZones,
  pickerZonesToBarcodeZonesJson,
} from '../utils/scanTemplateForm';
import './AdminSettings.css';

export default function ScanTemplateForm() {
  const navigate = useNavigate();
  const { templateId: templateIdParam } = useParams();
  const isNew = templateIdParam === 'new' || !templateIdParam;
  const numericId = !isNew ? parseInt(templateIdParam, 10) : NaN;
  const isValidEditId = Number.isFinite(numericId) && numericId >= 1;

  const [form, setForm] = useState(() => ({ ...SCANNER_BLANK_TPL }));
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [zoneSampleImageUrl, setZoneSampleImageUrl] = useState(null);
  const [zoneSamplePdfFile, setZoneSamplePdfFile] = useState(null);
  const [zoneSampleUploading, setZoneSampleUploading] = useState(false);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pdfPageIndex, setPdfPageIndex] = useState(0);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const zoneCanvasRef = useRef(null);

  useEffect(() => {
    if (isNew) {
      setForm({ ...SCANNER_BLANK_TPL });
      setLoading(false);
      return;
    }
    if (!isValidEditId) {
      setMessage({ type: 'error', text: 'Invalid template id' });
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.scanadmin
      .getTemplate(numericId)
      .then((row) => {
        if (cancelled || !row) {
          if (!cancelled && !row) setMessage({ type: 'error', text: 'Template not found' });
          return;
        }
        setForm(templateRowToForm(row));
      })
      .catch((err) => {
        if (!cancelled) setMessage({ type: 'error', text: err.message || 'Failed to load template' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isNew, isValidEditId, numericId]);

  useEffect(() => {
    if (form.TemplateID && !zoneSamplePdfFile) {
      setZoneSampleImageUrl(`${api.scanadmin.getTemplateSampleImageUrl(form.TemplateID)}?t=${Date.now()}`);
    } else if (!form.TemplateID && !zoneSamplePdfFile) {
      setZoneSampleImageUrl(null);
    }
  }, [form.TemplateID, zoneSamplePdfFile]);

  const loadPdfSample = async (file) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      setMessage({ type: 'error', text: 'Please upload a PDF file.' });
      return;
    }
    setMessage(null);
    setZoneSamplePdfFile(file);
    setZoneSampleUploading(true);
    setPdfPageIndex(0);
    try {
      configurePdfWorker();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, disableRange: true, disableStream: true }).promise;
      setPdfDoc(pdf);
      setPdfTotalPages(pdf.numPages);
      const dataUrl = await renderPageToDataUrl(pdf, 1, 1.25);
      setZoneSampleImageUrl(dataUrl);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to load PDF.' });
      setZoneSampleImageUrl(null);
      setPdfDoc(null);
    } finally {
      setZoneSampleUploading(false);
    }
  };

  const renderPdfPage = async (pageNum) => {
    if (!pdfDoc) return;
    try {
      setZoneSampleUploading(true);
      const dataUrl = await renderPageToDataUrl(pdfDoc, pageNum, 1.25);
      setZoneSampleImageUrl(dataUrl);
      setPdfPageIndex(pageNum - 1);
    } catch (err) {
      setMessage({ type: 'error', text: `Failed to render page ${pageNum}` });
    } finally {
      setZoneSampleUploading(false);
    }
  };

  const setF = (patch) => setForm((f) => ({ ...f, ...patch }));

  const onSubmit = async (e) => {
    e.preventDefault();
    const { error, payload } = buildTemplatePayload(form);
    if (error || !payload) {
      setMessage({ type: 'error', text: error || 'Invalid form' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (isNew) {
        await api.scanadmin.createTemplate(payload);
      } else {
        await api.scanadmin.updateTemplate(form.TemplateID, payload);
      }
      navigate('/admin/scan-settings?subtab=templates');
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const pickerZones = barcodeZonesJsonToPickerZones(form.barcodeZonesJson);

  if (loading) {
    return (
      <div className="page-wrap">
        <div className="settings-body">
          <div className="loading"><Loader2 className="spin" size={20} /> Loading template…</div>
        </div>
      </div>
    );
  }

  if (!isNew && !isValidEditId) {
    return (
      <div className="page-wrap">
        <div className="settings-body">
          <Link to="/admin/scan-settings?subtab=templates" className="btn btn-ghost btn-sm">
            <ArrowLeft size={12} /> Back to templates
          </Link>
          <p className="alert alert-danger" style={{ marginTop: 12 }}>Invalid template id.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <div className="settings-body">
        <div style={{ marginBottom: 14 }}>
          <Link to="/admin/scan-settings?subtab=templates" className="btn btn-ghost btn-sm">
            <ArrowLeft size={12} /> Back to templates
          </Link>
        </div>
        <h2>{isNew ? 'Create' : 'Edit'} scan template</h2>
        {message && (
          <div className={`alert ${message.type === 'error' ? 'alert-danger' : 'alert-success'}`} style={{ marginBottom: 8 }}>
            {message.text}
          </div>
        )}

        <form onSubmit={onSubmit} className="scan-form-body" style={{ padding: 0 }}>
          <div className="field-group">
            <label className="field-label">Template name *</label>
            <input className="field-input" value={form.templateName || ''} onChange={(e) => setF({ templateName: e.target.value })} />
          </div>
          <div className="field-group">
            <label className="field-label">Description</label>
            <input className="field-input" value={form.description || ''} onChange={(e) => setF({ description: e.target.value })} />
          </div>
          <div className="field-group">
            <label className="field-label">Active</label>
            <select className="field-input" value={form.isActive ?? 1} onChange={(e) => setF({ isActive: parseInt(e.target.value, 10) })}>
              <option value={1}>Yes</option>
              <option value={0}>No</option>
            </select>
          </div>

          <div className="scan-form-grid-3">
            <div className="field-group">
              <label className="field-label">Page count *</label>
              <input className="field-input" type="number" value={form.pageCount || 24} onChange={(e) => setF({ pageCount: parseInt(e.target.value, 10) || 24 })} />
            </div>
            <div className="field-group">
              <label className="field-label">DPI</label>
              <select className="field-input" value={form.dpi || 300} onChange={(e) => setF({ dpi: parseInt(e.target.value, 10) })}>
                {[100, 150, 200, 300, 400, 600].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">JPEG quality</label>
              <input className="field-input" type="number" min="1" max="100" value={form.jpegQuality || 85} onChange={(e) => setF({ jpegQuality: parseInt(e.target.value, 10) })} />
            </div>
            <div className="field-group">
              <label className="field-label">Color mode</label>
              <select className="field-input" value={form.colorMode || 'Grayscale'} onChange={(e) => setF({ colorMode: e.target.value })}>
                {['Color', 'Grayscale', 'BlackWhite'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Page size</label>
              <select className="field-input" value={form.pageSize || 'A4'} onChange={(e) => setF({ pageSize: e.target.value })}>
                {['A4', 'A3', 'Letter', 'Legal'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Duplex mode</label>
              <select className="field-input" value={form.duplexMode || 'Simplex'} onChange={(e) => setF({ duplexMode: e.target.value })}>
                {['Simplex', 'Duplex'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Brightness (0–255, 128=neutral)</label>
              <input className="field-input" type="number" min="0" max="255" value={form.brightnessAdj ?? 128} onChange={(e) => setF({ brightnessAdj: parseInt(e.target.value, 10) })} />
            </div>
            <div className="field-group">
              <label className="field-label">Contrast (0–255, 128=neutral)</label>
              <input className="field-input" type="number" min="0" max="255" value={form.contrastAdj ?? 128} onChange={(e) => setF({ contrastAdj: parseInt(e.target.value, 10) })} />
            </div>
            {form.colorMode === 'BlackWhite' && (
              <div className="field-group">
                <label className="field-label">Threshold (0–255, 128=neutral)</label>
                <input className="field-input" type="number" min="0" max="255" value={form.threshold ?? 128} onChange={(e) => setF({ threshold: parseInt(e.target.value, 10) })} />
              </div>
            )}
          </div>

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-color)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 8 }}>PDF compression</div>
            <div className="field-group" style={{ marginBottom: 8 }}>
              <label className="field-label">Quick preset</label>
              <select
                className="field-input"
                value=""
                onChange={(e) => {
                  const p = PDF_PRESETS[parseInt(e.target.value, 10)];
                  if (p) setF({ pdfJpegQuality: p.pdfJpegQuality, pdfMaxDpi: p.pdfMaxDpi });
                }}
              >
                <option value="">— Choose preset to auto-fill below —</option>
                {PDF_PRESETS.map((p, i) => (
                  <option key={p.label} value={i}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="scan-form-grid-3">
              <div className="field-group">
                <label className="field-label">PDF JPEG quality (1–100)</label>
                <input className="field-input" type="number" min="1" max="100" value={form.pdfJpegQuality ?? 70} onChange={(e) => setF({ pdfJpegQuality: parseInt(e.target.value, 10) })} />
              </div>
              <div className="field-group">
                <label className="field-label">PDF max DPI (0=native)</label>
                <input className="field-input" type="number" min="0" max="600" value={form.pdfMaxDpi ?? 150} onChange={(e) => setF({ pdfMaxDpi: parseInt(e.target.value, 10) })} />
              </div>
              <div className="field-group">
                <label className="field-label">Est. size (42 colour A4 pages)</label>
                <input
                  className="field-input"
                  readOnly
                  value={(() => {
                    const dpi = form.pdfMaxDpi ?? 150;
                    const q = form.pdfJpegQuality ?? 70;
                    const dpiEff = dpi === 0 ? 300 : Math.min(dpi, 300);
                    const kbPerPage = Math.round((dpiEff / 300) ** 2 * (q / 85) * 325);
                    return `~${((kbPerPage * 42) / 1024).toFixed(1)} MB`;
                  })()}
                />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-color)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 8 }}>Booklet ID and upload</div>
            <div className="field-group">
              <label className="field-label">PDF / folder name pattern</label>
              <input
                className="field-input"
                placeholder="Leave empty for default. Tokens: {BookletId} {ExamCode} {RollNo} {Time} {zone:barcodefilename}"
                value={form.pdfFilenameFormat || ''}
                onChange={(e) => setF({ pdfFilenameFormat: e.target.value })}
              />
            </div>
            <div className="scan-form-grid-3">
              <div className="field-group">
                <label className="field-label">Page-number barcode check from (1-based)</label>
                <input
                  className="field-input"
                  type="number"
                  min={1}
                  value={form.barcodeStartPage ?? 3}
                  onChange={(e) => setF({ barcodeStartPage: Math.max(1, parseInt(e.target.value, 10) || 3) })}
                />
              </div>
              <div className="field-group">
                <label className="field-label">Upload schedule</label>
                <select className="field-input" value={form.uploadScheduleMode || 'immediate'} onChange={(e) => setF({ uploadScheduleMode: e.target.value })}>
                  <option value="immediate">Immediate</option>
                  <option value="end_of_day">End of day (23:00 local)</option>
                  <option value="every_4h">Every 4 hours (window start)</option>
                  <option value="every_8h">Every 8 hours</option>
                  <option value="every_12h">Every 12 hours</option>
                  <option value="custom">Custom delay (minutes)</option>
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Custom delay (minutes)</label>
                <input
                  className="field-input"
                  type="number"
                  min={1}
                  placeholder="e.g. 60"
                  disabled={form.uploadScheduleMode !== 'custom'}
                  value={form.uploadScheduleParam || ''}
                  onChange={(e) => setF({ uploadScheduleParam: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Barcode / QR zones (% of page)</div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const rows = Array.isArray(form.barcodeZonesJson) ? [...form.barcodeZonesJson] : [];
                  rows.push({ ...SCANNER_BLANK_ZONE });
                  setF({ barcodeZonesJson: rows });
                }}
              >
                <Plus size={12} /> Add zone
              </button>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 8px' }}>
              Name a zone <code>barcodefilename</code> to drive the main booklet barcode when present. Use <code>pageserialno</code> (or <code>pagevalno</code>): scope <strong>First page only</strong> draws the footer strip once — the desktop reuses those % coords on every page from <strong>Footer page# start</strong> onward. Scope <strong>From page #</strong> does the same from max(start, N). Coordinates are top-left origin; width/height as % of page.
            </p>
            {(form.barcodeZonesJson || []).length === 0 ? (
              <p className="empty-row" style={{ padding: '8px 0' }}>No zones — desktop uses full-page heuristics on page 1.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>Zone name</th>
                      <th>Scope</th>
                      <th>Page</th>
                      <th>X%</th>
                      <th>Y%</th>
                      <th>W%</th>
                      <th>H%</th>
                      <th>Hint</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {form.barcodeZonesJson.map((z, idx) => (
                      <tr key={idx}>
                        <td>
                          <input
                            className="field-input"
                            style={{ minWidth: '100px' }}
                            value={z.zoneName}
                            onChange={(e) => {
                              const rows = [...form.barcodeZonesJson];
                              rows[idx] = { ...rows[idx], zoneName: e.target.value };
                              setF({ barcodeZonesJson: rows });
                            }}
                          />
                        </td>
                        <td>
                          <select
                            className="field-input"
                            value={z.pageScope || 'first'}
                            onChange={(e) => {
                              const rows = [...form.barcodeZonesJson];
                              rows[idx] = { ...rows[idx], pageScope: e.target.value };
                              setF({ barcodeZonesJson: rows });
                            }}
                          >
                            <option value="first">First page only</option>
                            <option value="fromPage">From page #</option>
                          </select>
                        </td>
                        <td>
                          <input
                            className="field-input"
                            type="number"
                            min={1}
                            disabled={z.pageScope !== 'fromPage'}
                            value={z.pageNumber ?? 1}
                            onChange={(e) => {
                              const rows = [...form.barcodeZonesJson];
                              rows[idx] = { ...rows[idx], pageNumber: Math.max(1, parseInt(e.target.value, 10) || 1) };
                              setF({ barcodeZonesJson: rows });
                            }}
                          />
                        </td>
                        {['xPct', 'yPct', 'wPct', 'hPct'].map((key) => (
                          <td key={key}>
                            <input
                              className="field-input"
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={z[key] ?? 0}
                              onChange={(e) => {
                                const rows = [...form.barcodeZonesJson];
                                rows[idx] = { ...rows[idx], [key]: parseFloat(e.target.value) || 0 };
                                setF({ barcodeZonesJson: rows });
                              }}
                            />
                          </td>
                        ))}
                        <td>
                          <input
                            className="field-input"
                            style={{ minWidth: '72px' }}
                            value={z.hint || 'ANY'}
                            onChange={(e) => {
                              const rows = [...form.barcodeZonesJson];
                              rows[idx] = { ...rows[idx], hint: e.target.value };
                              setF({ barcodeZonesJson: rows });
                            }}
                          />
                        </td>
                        <td className="action-cell">
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs btn-danger"
                            onClick={() => {
                              const rows = [...form.barcodeZonesJson];
                              rows.splice(idx, 1);
                              setF({ barcodeZonesJson: rows });
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="scan-form-toggles">
            <label className="scan-toggle-label">
              <input type="checkbox" checked={!!form.skipBlankPages} onChange={(e) => setF({ skipBlankPages: e.target.checked })} />
              Skip blank pages
            </label>
            <label className="scan-toggle-label">
              <input type="checkbox" checked={form.deSkew !== false} onChange={(e) => setF({ deSkew: e.target.checked })} />
              Auto de-skew
            </label>
          </div>

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-color)' }}>
            <h4 style={{ fontSize: '1rem', margin: '0 0 8px' }}>Sample page and zone picker</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 8px' }}>
              Upload a PDF to draw zones locally, or (after the template is saved) upload a reference image to the server.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              {form.TemplateID ? (
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {zoneSampleUploading ? <Loader2 size={13} className="spin" /> : <Plus size={13} />} Upload sample image
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setZoneSampleUploading(true);
                      try {
                        const fd = new FormData();
                        fd.append('sampleImage', file);
                        await api.scanadmin.uploadTemplateSampleImage(form.TemplateID, fd);
                        setZoneSampleImageUrl(`${api.scanadmin.getTemplateSampleImageUrl(form.TemplateID)}?t=${Date.now()}`);
                        setZoneSamplePdfFile(null);
                        setPdfDoc(null);
                      } catch (err) {
                        setMessage({ type: 'error', text: err.message || 'Upload failed' });
                      } finally {
                        setZoneSampleUploading(false);
                      }
                    }}
                  />
                </label>
              ) : null}

              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                {zoneSampleUploading ? <Loader2 size={13} className="spin" /> : <Plus size={13} />} Upload sample PDF (preview)
                <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) loadPdfSample(f); }} />
              </label>

              {zoneSampleImageUrl && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF({ barcodeZonesJson: [] })}>
                  Clear drawn zones
                </button>
              )}
            </div>

            {pdfDoc && (
              <div style={{ marginBottom: 12, padding: 8, background: 'var(--bg-secondary)', borderRadius: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <label>Preview page:</label>
                  <input
                    type="number"
                    min={1}
                    max={pdfTotalPages}
                    value={pdfPageIndex + 1}
                    onChange={(e) => {
                      const p = Number(e.target.value);
                      if (p >= 1 && p <= pdfTotalPages) renderPdfPage(p);
                    }}
                    className="field-input"
                    style={{ width: 60 }}
                  />
                  <span style={{ fontSize: '0.85rem' }}>of {pdfTotalPages}</span>
                </div>
              </div>
            )}

            <ZonePicker
              zones={pickerZones}
              onZonesChange={(zones) => setF({ barcodeZonesJson: pickerZonesToBarcodeZonesJson(zones) })}
              canvasRef={zoneCanvasRef}
              externalImageUrl={zoneSampleImageUrl}
            />
          </div>

          <div className="scan-form-info" style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save template'}</button>
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => navigate('/admin/scan-settings?subtab=templates')}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
