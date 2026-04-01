import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus, X } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { api } from '../services/api';
import ZonePicker from '../components/ZonePicker';
import { configurePdfWorker, renderPageToDataUrl } from '../utils/pdfBooklet';
import './AdminSettings.css';

const SCANNER_BLANK_TPL = {
  templateName: '', description: '', pageCount: 24, dpi: 300, colorMode: 'Grayscale',
  pageSize: 'A4', duplexMode: 'Simplex', jpegQuality: 85, brightnessAdj: 128, contrastAdj: 128,
  threshold: 128, pdfJpegQuality: 70, pdfMaxDpi: 150, skipBlankPages: false, deSkew: true,
  barcodeZones: [], pageBarcodeStartPage: 2, pdfFilenameFormat: '{BookletId}',
  uploadScheduleMode: 'Immediate', uploadIntervalHours: 0, isActive: 1,
};

const UPLOAD_SCHEDULE_OPTIONS = [
  { value: 'Immediate', label: 'Immediate' },
  { value: 'Every4h', label: 'Every 4 hours' },
  { value: 'Every8h', label: 'Every 8 hours' },
  { value: 'Every12h', label: 'Every 12 hours' },
  { value: 'Custom', label: 'Custom interval' },
  { value: 'EndOfDay', label: 'End of day (23:00)' },
];

const BARCODE_PAGE_SCOPE_OPTIONS = [
  { value: 'FirstPage', label: 'First page only' },
  { value: 'AllPages', label: 'All pages' },
  { value: 'FromPage', label: 'From page N' },
  { value: 'SpecificPages', label: 'Specific page' },
];

const BARCODE_HINT_OPTIONS = ['ANY', 'QR', 'CODE128', 'CODE39'];

const PDF_PRESETS = [
  { label: 'Archive — original quality (≈14 MB / 42 pages)', pdfJpegQuality: 85, pdfMaxDpi: 0 },
  { label: 'High — 200 DPI / 75 % quality (≈6 MB / 42 pages)', pdfJpegQuality: 75, pdfMaxDpi: 200 },
  { label: 'Standard — 150 DPI / 70 % quality (≈3 MB / 42 pages)', pdfJpegQuality: 70, pdfMaxDpi: 150 },
  { label: 'Small — 150 DPI / 60 % quality (≈2 MB / 42 pages)', pdfJpegQuality: 60, pdfMaxDpi: 150 },
];

function normalizeTemplateData(row = {}) {
  const barcodeZones = Array.isArray(row.barcodeZones)
    ? row.barcodeZones
    : Array.isArray(row.BarcodeZones)
      ? row.BarcodeZones
      : [];

  const getValue = (field, defaultValue) => {
    const camel = row[field];
    const pascal = row[field.charAt(0).toUpperCase() + field.slice(1)];
    return camel ?? pascal ?? defaultValue;
  };

  return {
    ...SCANNER_BLANK_TPL,
    TemplateID: row.TemplateID ?? row.templateID ?? null,
    templateName: getValue('templateName', ''),
    description: getValue('description', ''),
    pageCount: Number(getValue('pageCount', 24)),
    dpi: Number(getValue('dpi', 300)),
    colorMode: getValue('colorMode', 'Grayscale'),
    pageSize: getValue('pageSize', 'A4'),
    duplexMode: getValue('duplexMode', 'Simplex'),
    jpegQuality: Number(getValue('jpegQuality', 85)),
    brightnessAdj: Number(getValue('brightnessAdj', 128)),
    contrastAdj: Number(getValue('contrastAdj', 128)),
    threshold: Number(getValue('threshold', 128)),
    pdfJpegQuality: Number(getValue('pdfJpegQuality', 70)),
    pdfMaxDpi: Number(getValue('pdfMaxDpi', 150)),
    skipBlankPages: !!getValue('skipBlankPages', false),
    deSkew: getValue('deSkew', true),
    isActive: Number(getValue('isActive', 1)),
    barcodeZones,
    pageBarcodeStartPage: Number(getValue('pageBarcodeStartPage', 2)),
    pdfFilenameFormat: getValue('pdfFilenameFormat', '{BookletId}'),
    uploadScheduleMode: getValue('uploadScheduleMode', 'Immediate'),
    uploadIntervalHours: Number(getValue('uploadIntervalHours', 0)),
  };
}

export default function ScanTemplateForm() {
  const navigate = useNavigate();
  const { templateId } = useParams();
  const isEdit = !!templateId;
  const [template, setTemplate] = useState(SCANNER_BLANK_TPL);
  const [loading, setLoading] = useState(isEdit);
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
    if (isEdit) {
      setLoading(true);
      api.scanadmin.getTemplate(parseInt(templateId, 10))
        .then((row) => { if (row) setTemplate(normalizeTemplateData(row)); else setMessage({ type: 'error', text: 'Template not found' }); })
        .catch((err) => setMessage({ type: 'error', text: err.message || 'Failed to load template' }))
        .finally(() => setLoading(false));
    }
  }, [isEdit, templateId]);

  useEffect(() => {
    if (template?.TemplateID && !zoneSamplePdfFile) {
      setZoneSampleImageUrl(api.scanadmin.getTemplateSampleImageUrl(template.TemplateID) + '?t=' + Date.now());
    } else if (!template?.TemplateID && !zoneSamplePdfFile) {
      setZoneSampleImageUrl(null);
    }
  }, [template?.TemplateID, zoneSamplePdfFile]);

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
      // Render first page
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

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await api.scanadmin.updateTemplate(template.TemplateID, template);
      } else {
        await api.scanadmin.createTemplate(template);
      }
      navigate('/admin/settings?tab=scanner&subtab=templates');
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field, value) => setTemplate((t) => ({ ...t, [field]: value }));
  const setBarcodeZone = (zones) => setTemplate((t) => ({ ...t, barcodeZones: zones }));

  const renderMessage = () => {
    if (!message) return null;
    return <div className={`alert ${message.type === 'error' ? 'alert-danger' : 'alert-success'}`} style={{ marginBottom: 8 }}>{message.text}</div>;
  };

  if (loading) {
    return (
      <div className="page-wrap">
        <div className="settings-body"><div className="loading"><Loader2 className="spin" size={20} /> Loading template…</div></div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <div className="settings-body">
        <div style={{ marginBottom: 14 }}>
          <Link to="/admin/settings?tab=scanner&subtab=templates" className="btn btn-ghost btn-sm"><ArrowLeft size={12} /> Back to templates</Link>
        </div>
        <h2>{isEdit ? 'Edit' : 'Create'} Scan Template</h2>
        {renderMessage()}
        <form onSubmit={onSubmit} className="scan-form-body" style={{ padding: 0 }}>
          <div className="field-group"><label className="field-label">Template Name *</label>
            <input className="field-input" value={template.templateName || ''} onChange={(e) => updateField('templateName', e.target.value)} required /></div>
          <div className="field-group"><label className="field-label">Description</label>
            <input className="field-input" value={template.description || ''} onChange={(e) => updateField('description', e.target.value)} /></div>
          <div className="scan-form-grid-3">
            <div className="field-group"><label className="field-label">Page Count *</label>
              <input className="field-input" type="number" value={template.pageCount || 24} onChange={(e) => updateField('pageCount', Number(e.target.value))} required /></div>
            <div className="field-group"><label className="field-label">DPI</label>
              <select className="field-input" value={template.dpi || 300} onChange={(e) => updateField('dpi', Number(e.target.value))}>
                {[100,150,200,300,400,600].map((dpi) => <option key={dpi} value={dpi}>{dpi}</option>)}
              </select></div>
            <div className="field-group"><label className="field-label">JPEG Quality</label>
              <input className="field-input" type="number" min="1" max="100" value={template.jpegQuality || 85} onChange={(e) => updateField('jpegQuality', Number(e.target.value))} /></div>
            <div className="field-group"><label className="field-label">Color Mode</label>
              <select className="field-input" value={template.colorMode || 'Grayscale'} onChange={(e) => updateField('colorMode', e.target.value)}>
                {['Color','Grayscale','BlackWhite'].map((v) => <option key={v}>{v}</option>)}
              </select></div>
            <div className="field-group"><label className="field-label">Page Size</label>
              <select className="field-input" value={template.pageSize || 'A4'} onChange={(e) => updateField('pageSize', e.target.value)}>
                {['A4','A3','Letter','Legal'].map((v) => <option key={v}>{v}</option>)}
              </select></div>
            <div className="field-group"><label className="field-label">Duplex Mode</label>
              <select className="field-input" value={template.duplexMode || 'Simplex'} onChange={(e) => updateField('duplexMode', e.target.value)}>
                {['Simplex','Duplex'].map((v) => <option key={v}>{v}</option>)}
              </select></div>
          </div>
          <div className="field-group"><label className="field-label">Brightness (0-255)</label>
            <input className="field-input" type="number" min="0" max="255" value={template.brightnessAdj ?? 128} onChange={(e) => updateField('brightnessAdj', Number(e.target.value))} /></div>
          <div className="field-group"><label className="field-label">Contrast (0-255)</label>
            <input className="field-input" type="number" min="0" max="255" value={template.contrastAdj ?? 128} onChange={(e) => updateField('contrastAdj', Number(e.target.value))} /></div>
          {template.colorMode === 'BlackWhite' && (
            <div className="field-group"><label className="field-label">Threshold (0-255)</label>
              <input className="field-input" type="number" min="0" max="255" value={template.threshold ?? 128} onChange={(e) => updateField('threshold', Number(e.target.value))} /></div>
          )}

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-color)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 8 }}>PDF COMPRESSION</div>
            <div className="field-group" style={{ marginBottom: 8 }}>
              <label className="field-label">Quick Preset</label>
              <select className="field-input" value="" onChange={(e) => {
                const p = PDF_PRESETS[Number(e.target.value)];
                if (p) updateField('pdfJpegQuality', p.pdfJpegQuality) || updateField('pdfMaxDpi', p.pdfMaxDpi);
              }}>
                <option value="">— choose to auto-fill below —</option>
                {PDF_PRESETS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
              </select>
            </div>
            <div className="scan-form-grid-3">
              <div className="field-group">
                <label className="field-label">PDF JPEG Quality (1-100)</label>
                <input className="field-input" type="number" min="1" max="100" value={template.pdfJpegQuality ?? 70} onChange={(e) => updateField('pdfJpegQuality', Number(e.target.value))} />
              </div>
              <div className="field-group">
                <label className="field-label">PDF Max DPI (0=native)</label>
                <input className="field-input" type="number" min="0" max="600" value={template.pdfMaxDpi ?? 150} onChange={(e) => updateField('pdfMaxDpi', Number(e.target.value))} />
              </div>
              <div className="field-group">
                <label className="field-label">Est. size (42 colour A4 pages)</label>
                <input className="field-input" readOnly value={(() => {
                  const dpi = template.pdfMaxDpi ?? 150;
                  const q = template.pdfJpegQuality ?? 70;
                  const dpiEff = dpi === 0 ? 300 : Math.min(dpi, 300);
                  const kbPerPage = Math.round((dpiEff / 300) ** 2 * (q / 85) * 325);
                  return `~${((kbPerPage * 42) / 1024).toFixed(1)} MB`;
                })()} />
              </div>
            </div>
          </div>

          <div className="scan-form-toggles">
            <label className="scan-toggle-label"><input type="checkbox" checked={!!template.skipBlankPages} onChange={(e) => updateField('skipBlankPages', e.target.checked)} /> Skip Blank Pages</label>
            <label className="scan-toggle-label"><input type="checkbox" checked={template.deSkew !== false} onChange={(e) => updateField('deSkew', e.target.checked)} /> Auto De-Skew</label>
          </div>

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-color)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 8 }}>UPLOAD SCHEDULE</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
              {UPLOAD_SCHEDULE_OPTIONS.map((opt) => (
                <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input type="radio" name="uploadScheduleMode" checked={(template.uploadScheduleMode || 'Immediate') === opt.value} onChange={() => updateField('uploadScheduleMode', opt.value)} />
                  {opt.label}
                </label>
              ))}
            </div>
            {template.uploadScheduleMode === 'Custom' && (
              <div className="field-group" style={{ maxWidth: '200px' }}>
                <label className="field-label">Interval (hours)</label>
                <input className="field-input" type="number" min="1" max="24" step="0.5" value={template.uploadIntervalHours || 1} onChange={(e) => updateField('uploadIntervalHours', Number(e.target.value))} />
              </div>
            )}
          </div>

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-color)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '8px' }}>PDF FILENAME FORMAT</div>
            <div className="field-group">
              <label className="field-label">Format (use tokens in curly braces)</label>
              <input className="field-input" value={template.pdfFilenameFormat || '{BookletId}'} onChange={(e) => updateField('pdfFilenameFormat', e.target.value)} placeholder="{BookletId}" />
            </div>
          </div>

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-color)' }}>
            <h4>Barcode/QR Zone Mapping (PDF)</h4>
            <div className="scan-form-grid-3" style={{ marginBottom: '12px' }}>
              <div className="field-group">
                <label className="field-label">Start reading barcode from page *</label>
                <input className="field-input" type="number" min="1" value={template.pageBarcodeStartPage ?? 2} onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val >= 1 && val <= (pdfTotalPages || 999)) updateField('pageBarcodeStartPage', val);
                }} placeholder="Page #" />
                {pdfTotalPages > 0 && <small style={{color:'var(--text-muted)'}}>PDF has {pdfTotalPages} pages</small>}
              </div>
            </div>

            {pdfDoc && (
              <div style={{ marginBottom: '12px', padding: '8px', background: 'var(--bg-secondary)', borderRadius: '4px' }}>
                <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px'}}>
                  <label>Preview page:</label>
                  <input type="number" min="1" max={pdfTotalPages} value={pdfPageIndex + 1} onChange={(e) => {
                    const p = Number(e.target.value);
                    if (p >= 1 && p <= pdfTotalPages) renderPdfPage(p);
                  }} className="field-input" style={{width:'60px'}} />
                  <span style={{fontSize:'0.85rem'}}>of {pdfTotalPages}</span>
                  {pdfPageIndex + 1 >= template.pageBarcodeStartPage && (
                    <span style={{fontSize:'0.75rem', background:'var(--color-success)', color:'white', padding:'2px 6px', borderRadius:'3px'}}>
                      Barcode zone page
                    </span>
                  )}
                </div>
                <div style={{fontSize:'0.75rem', color:'var(--text-muted)', lineHeight:'1.4'}}>
                  Click and drag on the image to define zones. Use "Page barcode starts from" above to set the page where barcode reading begins. Zones will be shared for all pages from that page onward.
                </div>
              </div>
            )}

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    {['Zone Name','Page Scope','Page #','X %','Y %','W %','H %','Hint',''].map((h) => (
                      <th key={h} style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {template.barcodeZones.map((zone, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '3px 4px' }}><input style={{ width: '90px' }} className="field-input" value={zone.name || ''} onChange={(e) => {
                        const z = [...template.barcodeZones]; z[idx] = { ...z[idx], name: e.target.value }; setBarcodeZone(z);
                      }} placeholder="e.g. RollNo" /></td>
                      <td style={{ padding: '3px 4px' }}>
                        <select className="field-input" value={zone.pageScope || 'FirstPage'} onChange={(e) => {
                          const z = [...template.barcodeZones]; z[idx] = { ...z[idx], pageScope: e.target.value }; setBarcodeZone(z);
                        }}>
                          {BARCODE_PAGE_SCOPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '3px 4px' }}>
                        <input style={{ width: '50px' }} className="field-input" type="number" min="1" value={zone.pageScopeValue || 1} disabled={zone.pageScope === 'FirstPage' || zone.pageScope === 'AllPages'} onChange={(e) => {
                          const z = [...template.barcodeZones]; z[idx] = { ...z[idx], pageScopeValue: Number(e.target.value) }; setBarcodeZone(z);
                        }} />
                      </td>
                      {['x','y','w','h'].map((field) => (
                        <td key={field} style={{ padding: '3px 4px' }}>
                          <input style={{ width: '54px' }} className="field-input" type="number" min="0" max="100" step="1" value={Math.round((zone[field] || 0) * 100)} onChange={(e) => {
                            const z = [...template.barcodeZones]; z[idx] = { ...z[idx], [field]: Number(e.target.value) / 100 }; setBarcodeZone(z);
                          }} />
                        </td>
                      ))}
                      <td style={{ padding: '3px 4px' }}>
                        <select className="field-input" value={zone.hint || 'ANY'} onChange={(e) => {
                          const z = [...template.barcodeZones]; z[idx] = { ...z[idx], hint: e.target.value }; setBarcodeZone(z);
                        }}>
                          {BARCODE_HINT_OPTIONS.map((h) => <option key={h}>{h}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '3px 4px' }}>
                        <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => {
                          const z = template.barcodeZones.filter((_, i) => i !== idx); setBarcodeZone(z);
                        }}><X size={12} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: '6px' }} onClick={() => {
              setBarcodeZone([...template.barcodeZones, { name: '', pageScope: 'AllPages', pageScopeValue: 1, x: 0, y: 0, w: 0.5, h: 0.1, hint: 'ANY' }]);
            }}><Plus size={12} /> Add Zone</button>
          </div>

          {isEdit && template.TemplateID && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-color)' }}>
              <h4>Sample Page & Zone Picker</h4>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {zoneSampleUploading ? <Loader2 size={13} className="spin" /> : <Plus size={13} />} Upload Sample Image
                  <input type="file" accept=".jpg,.jpeg,.png" style={{ display: 'none' }} onChange={async (e) => {
                    const file = e.target.files?.[0]; if (!file) return;
                    setZoneSampleUploading(true);
                    try {
                      if (template.TemplateID) {
                        const fd = new FormData(); fd.append('sampleImage', file);
                        await api.scanadmin.uploadTemplateSampleImage(template.TemplateID, fd);
                        setZoneSampleImageUrl(api.scanadmin.getTemplateSampleImageUrl(template.TemplateID) + '?t=' + Date.now());
                        setZoneSamplePdfFile(null);
                        setPdfDoc(null);
                      }
                    } catch (err) {
                      setMessage({ type: 'error', text: err.message || 'Upload failed' });
                    } finally {
                      setZoneSampleUploading(false);
                    }
                  }} />
                </label>

                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {zoneSampleUploading ? <Loader2 size={13} className="spin" /> : <Plus size={13} />} Upload Sample PDF (multi-page)
                  <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={async (e) => {
                    const file = e.target.files?.[0]; if (!file) return;
                    await loadPdfSample(file);
                  }} />
                </label>

                {zoneSampleImageUrl && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setTemplate((t) => ({ ...t, barcodeZones: [] })); setZoneSampleImageUrl(null); setZoneSamplePdfFile(null); setPdfDoc(null); }}>
                    Clear Zones
                  </button>
                )}
              </div>
              <ZonePicker templateId={template.TemplateID} zones={template.barcodeZones || []} onZonesChange={setBarcodeZone} canvasRef={zoneCanvasRef} externalImageUrl={zoneSampleImageUrl} />
            </div>
          )}

          <div className="scan-form-info" style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save template'}</button>
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => navigate('/admin/settings?tab=scanner&subtab=templates')}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
