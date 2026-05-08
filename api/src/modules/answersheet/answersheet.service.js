import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger.js';
import { getAnswerSheetLogoDir } from '../../middleware/upload.js';

const PT = 72 / 25.4;

const PAPER = {
  A4:    { w: 210 * PT, h: 297 * PT, pdfSize: 'A4'        },
  Legal: { w: 216 * PT, h: 356 * PT, pdfSize: [612, 1008] },
};

const FONT_REGULAR = 'Helvetica';
const FONT_BOLD    = 'Helvetica-Bold';

const DEFAULT_MARGIN = { top: 15, right: 15, bottom: 18, left: 25 };
const DEFAULT_FOOTER = { show: true, height: 12, showPageNo: true, showSerial: true };
const DEFAULT_REG_MARKS = { show: false, size: 5, offset: 4 };
const DEFAULT_VALUER = {
  show: false,
  count: 3,
  labels: ['Examiner', 'Moderator', 'Head Examiner'],
  columns: ['Marks Awarded', 'Marks in Words', 'Signature'],
};

export const DEFAULT_COVER_FIELDS = [
  { id: 'si_no',           label: 'SI No',                          layout: 'half', enabled: true,  order: 1  },
  { id: 'college_name',    label: 'University / College Name',       layout: 'full', enabled: true,  order: 2  },
  { id: 'paper_no',        label: 'Paper No & Subject',              layout: 'full', enabled: true,  order: 3  },
  { id: 'notification_no', label: 'Notification No & District Code', layout: 'full', enabled: true,  order: 4  },
  { id: 'application_id',  label: 'Application ID',                  layout: 'half', enabled: true,  order: 5  },
  { id: 'hall_ticket',     label: 'Hall Ticket No',                  layout: 'half', enabled: true,  order: 6  },
  { id: 'candidate_name',  label: 'Name of the Candidate',           layout: 'full', enabled: true,  order: 7  },
  { id: 'dob',             label: 'Date of Birth',                   layout: 'half', enabled: true,  order: 8  },
  { id: 'exam_datetime',   label: 'Date & Time of Examination',      layout: 'full', enabled: true,  order: 9  },
  { id: 'centre',          label: 'Centre Code & Name',              layout: 'full', enabled: true,  order: 10 },
];

export default class AnswerSheetService {
  constructor(repo) {
    this.repo = repo;
  }

  async list()      { return this.repo.list(); }
  async listExams() { return this.repo.listExams(); }

  async getById(id) {
    const t = await this.repo.findById(id);
    if (!t) throw Object.assign(new Error('Template not found'), { statusCode: 404 });
    return this._normalise(t);
  }

  async create(data, user, ip) {
    const id = await this.repo.create({ ...data, createdBy: user, createdFromIP: ip });
    return this.getById(id);
  }

  async update(id, data, user, ip) {
    const affected = await this.repo.update(id, { ...data, modifiedBy: user, modifiedFromIP: ip });
    if (!affected) throw Object.assign(new Error('Template not found'), { statusCode: 404 });
    return this.getById(id);
  }

  async remove(id, user) {
    const affected = await this.repo.softDelete(id, user);
    if (!affected) throw Object.assign(new Error('Template not found'), { statusCode: 404 });
  }

  // ── PDF generation ──────────────────────────────────────────────────────────

  async generatePdf(id, res) {
    const tmpl  = await this.getById(id);
    const paper = PAPER[tmpl.paperSize] || PAPER.A4;
    const PW    = paper.w;
    const PH    = paper.h;
    const margin = tmpl.marginConfig;
    const footer = tmpl.footerConfig;
    const regMarks = tmpl.registrationMarks;
    const theme = tmpl.themeColor || '#1a3a6b';

    const fields = (tmpl.coverFields || DEFAULT_COVER_FIELDS)
      .filter(f => f.enabled)
      .sort((a, b) => a.order - b.order);

    const { default: PDFDocument } = await import('pdfkit');

    const doc = new PDFDocument({
      size: paper.pdfSize,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      autoFirstPage: false,
      bufferPages: true,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="answer-sheet-${tmpl.templateName.replace(/\s+/g, '_')}.pdf"`
    );
    doc.pipe(res);

    let logoImage = null;
    if (tmpl.logoPath) {
      const logoFile = path.join(getAnswerSheetLogoDir(), tmpl.logoPath);
      if (fs.existsSync(logoFile)) logoImage = logoFile;
    }

    // Page 1 — cover
    doc.addPage();
    if (regMarks.show) this._drawRegistrationMarks(doc, PW, PH, regMarks);
    this._drawCoverPage(doc, tmpl, fields, PW, PH, theme, logoImage);

    // Page 2 — instructions
    if (tmpl.instructions2) {
      doc.addPage();
      if (regMarks.show) this._drawRegistrationMarks(doc, PW, PH, regMarks);
      this._drawInstructionsPage(doc, 'INSTRUCTIONS', tmpl.instructions2, PW, PH, theme, margin);
    }

    // Page 3 — valuer section OR more instructions
    if (tmpl.valuerConfig?.show) {
      doc.addPage();
      if (regMarks.show) this._drawRegistrationMarks(doc, PW, PH, regMarks);
      this._drawValuerPage(doc, tmpl, PW, PH, theme, margin);
    } else if (tmpl.instructions3) {
      doc.addPage();
      if (regMarks.show) this._drawRegistrationMarks(doc, PW, PH, regMarks);
      this._drawInstructionsPage(doc, 'INSTRUCTIONS (continued)', tmpl.instructions3, PW, PH, theme, margin);
    }

    // Answer pages
    for (let pg = 1; pg <= tmpl.totalAnswerPages; pg++) {
      doc.addPage();
      if (regMarks.show) this._drawRegistrationMarks(doc, PW, PH, regMarks);
      await this._drawAnswerPage(doc, tmpl, pg, PW, PH, theme, margin, footer);
    }

    // Rough work pages
    for (let rp = 1; rp <= (tmpl.roughWorkPages || 0); rp++) {
      doc.addPage();
      if (regMarks.show) this._drawRegistrationMarks(doc, PW, PH, regMarks);
      this._drawRoughWorkPage(doc, rp, tmpl.roughWorkPages, PW, PH, theme, margin, footer);
    }

    doc.end();
    const totalPg = 1
      + (tmpl.instructions2 ? 1 : 0)
      + (tmpl.valuerConfig?.show ? 1 : (tmpl.instructions3 ? 1 : 0))
      + tmpl.totalAnswerPages
      + (tmpl.roughWorkPages || 0);
    logger.info(`Answer sheet PDF generated templateId=${id} paper=${tmpl.paperSize} pages=${totalPg}`);
  }

  // ── Registration marks ──────────────────────────────────────────────────────

  _drawRegistrationMarks(doc, PW, PH, cfg) {
    const s  = (cfg.size || 5) * PT;
    const o  = (cfg.offset || 4) * PT;
    const lw = 1.2;
    doc.save().lineWidth(lw).strokeColor('#000');

    const corners = [
      [o, o],
      [PW - o - s, o],
      [o, PH - o - s],
      [PW - o - s, PH - o - s],
    ];
    for (const [x, y] of corners) {
      doc.moveTo(x, y).lineTo(x + s, y).stroke();
      doc.moveTo(x, y).lineTo(x, y + s).stroke();
    }
    doc.restore();
  }

  // ── Cover page ──────────────────────────────────────────────────────────────

  _drawCoverPage(doc, tmpl, fields, PW, PH, theme, logoImage) {
    const MO = 15 * PT;
    const w  = PW - 2 * MO;
    let y    = 12 * PT;

    // Organisation header with logo
    if (tmpl.orgName || logoImage) {
      const headerH = 40 * PT;
      doc.rect(MO, y, w, headerH).fillAndStroke(theme, theme);

      let textX = MO + 6 * PT;
      let textW = w - 12 * PT;

      if (logoImage) {
        try {
          const logoSize = 30 * PT;
          doc.image(logoImage, MO + 5 * PT, y + 5 * PT, { width: logoSize, height: logoSize, fit: [logoSize, logoSize] });
          textX = MO + 40 * PT;
          textW = w - 50 * PT;
        } catch { /* logo load failed, skip */ }
      }

      doc.fillColor('white').font(FONT_BOLD).fontSize(12);
      if (tmpl.orgName) {
        doc.text(tmpl.orgName, textX, y + 6 * PT, { width: textW, align: 'center' });
      }
      if (tmpl.orgNameSecondary) {
        doc.font(FONT_REGULAR).fontSize(9)
          .text(tmpl.orgNameSecondary, textX, y + 22 * PT, { width: textW, align: 'center' });
      }
      y += headerH + 4 * PT;
    }

    // Title bar
    const titleH = 22 * PT;
    doc.rect(MO, y, w, titleH).fillAndStroke(theme, theme);
    doc.fillColor('white').font(FONT_BOLD).fontSize(13)
      .text('ANSWER BOOKLET', MO, y + 5 * PT, { width: w, align: 'center' });
    y += titleH + 4 * PT;

    // Exam name
    const examLabel = tmpl.examName
      ? `${tmpl.examCode ? tmpl.examCode + ' — ' : ''}${tmpl.examName}` : '';
    if (examLabel) {
      doc.fillColor('#333').font(FONT_BOLD).fontSize(9)
        .text(examLabel, MO, y, { width: w, align: 'center' });
      y += 14 * PT;
    }

    // Paper code line
    if (tmpl.paperCode) {
      doc.fillColor('#555').font(FONT_REGULAR).fontSize(8)
        .text(`Paper Code: ${tmpl.paperCode}`, MO, y, { width: w, align: 'center' });
      y += 12 * PT;
    }

    doc.moveTo(MO, y).lineTo(MO + w, y).strokeColor(theme).lineWidth(0.8).stroke();
    y += 6 * PT;

    // Candidate fields
    const FIELD_H = 20 * PT;
    doc.lineWidth(0.5).strokeColor('#555');
    let i = 0;
    while (i < fields.length) {
      const f    = fields[i];
      const next = fields[i + 1];
      const full = f.layout === 'full' || !next || next.layout === 'full';
      if (full) {
        this._drawField(doc, f.label, MO, y, w, FIELD_H, theme);
        i++;
      } else {
        const hw = (w - 4 * PT) / 2;
        this._drawField(doc, f.label, MO, y, hw, FIELD_H, theme);
        this._drawField(doc, next.label, MO + hw + 4 * PT, y, hw, FIELD_H, theme);
        i += 2;
      }
      y += FIELD_H + 3 * PT;
    }

    // Question mapping table
    if (tmpl.questionMapping?.show && tmpl.questionMapping.questions > 0) {
      y += 6 * PT;
      y = this._drawQuestionMapping(doc, tmpl.questionMapping, MO, y, w, theme);
    }

    // Signature row at bottom
    y = Math.max(y + 8 * PT, PH - 65 * PT);
    doc.moveTo(MO, y).lineTo(MO + w, y).strokeColor('#aaa').lineWidth(0.4).stroke();
    y += 5 * PT;
    const sigW = w / 3 - 4 * PT;
    ['Invigilator Signature', 'Room No / Seat No', 'For Official Use Only'].forEach((lbl, idx) => {
      const sx = MO + idx * (sigW + 6 * PT);
      doc.fillColor('#888').font(FONT_REGULAR).fontSize(7)
        .text(lbl, sx, y, { width: sigW, align: 'center' });
      doc.rect(sx, y + 10 * PT, sigW, 16 * PT).strokeColor('#aaa').lineWidth(0.4).stroke();
    });

    // Border
    doc.rect(MO - 2 * PT, 10 * PT, w + 4 * PT, PH - 20 * PT)
      .lineWidth(0.8).strokeColor(theme).stroke();
  }

  _drawField(doc, label, x, y, w, h, theme) {
    doc.rect(x, y, w, h).strokeColor('#555').lineWidth(0.5).stroke();
    const lw = Math.min(w * 0.38, 100 * PT);
    const bgColor = this._lightenColor(theme, 0.9);
    doc.rect(x, y, lw, h).fillColor(bgColor).fill();
    doc.fillColor('#333').font(FONT_BOLD).fontSize(7)
      .text(label, x + 3 * PT, y + (h / 2) - 4 * PT, { width: lw - 6 * PT, ellipsis: true });
    doc.moveTo(x + lw, y).lineTo(x + lw, y + h).strokeColor('#aaa').lineWidth(0.4).stroke();
  }

  // ── Question mapping table on cover ─────────────────────────────────────────

  _drawQuestionMapping(doc, qm, x0, y, w, theme) {
    const count = qm.questions || 5;
    const rowH  = 14 * PT;
    const hdrH  = 16 * PT;
    const cols  = ['Q. No.', 'Marks'];

    doc.fillColor('#333').font(FONT_BOLD).fontSize(8)
      .text('Question-wise Marks', x0, y, { width: w, align: 'center' });
    y += 14 * PT;

    const colW = w / (cols.length + count);
    const qColW = (w - cols.length * 50 * PT) / count;

    // Header
    doc.rect(x0, y, w, hdrH).fillColor(this._lightenColor(theme, 0.9)).fill();
    doc.strokeColor('#888').lineWidth(0.4);

    let cx = x0;
    doc.fillColor('#333').font(FONT_BOLD).fontSize(6);
    doc.rect(cx, y, 35 * PT, hdrH).stroke();
    doc.text(cols[0], cx + 2 * PT, y + 4 * PT, { width: 31 * PT, align: 'center' });
    cx += 35 * PT;

    for (let q = 1; q <= count; q++) {
      const cw = Math.max(15 * PT, (w - 70 * PT) / count);
      doc.rect(cx, y, cw, hdrH).stroke();
      doc.text(String(q), cx, y + 4 * PT, { width: cw, align: 'center' });
      cx += cw;
    }

    const totalW = w - (cx - x0);
    doc.rect(cx, y, totalW > 0 ? totalW : 35 * PT, hdrH).stroke();
    doc.text('Total', cx + 2 * PT, y + 4 * PT, { width: (totalW > 0 ? totalW : 35 * PT) - 4 * PT, align: 'center' });
    y += hdrH;

    // Marks row (empty)
    cx = x0;
    doc.rect(cx, y, 35 * PT, rowH).stroke();
    doc.font(FONT_REGULAR).fontSize(6)
      .text(cols[1], cx + 2 * PT, y + 3 * PT, { width: 31 * PT, align: 'center' });
    cx += 35 * PT;

    for (let q = 1; q <= count; q++) {
      const cw = Math.max(15 * PT, (w - 70 * PT) / count);
      doc.rect(cx, y, cw, rowH).stroke();
      cx += cw;
    }
    const totalW2 = w - (cx - x0);
    doc.rect(cx, y, totalW2 > 0 ? totalW2 : 35 * PT, rowH).stroke();
    y += rowH;

    return y;
  }

  // ── Instructions page ───────────────────────────────────────────────────────

  _drawInstructionsPage(doc, title, text, PW, PH, theme, margin) {
    const ml = (margin.left || 15) * PT;
    const mr = (margin.right || 15) * PT;
    const mt = (margin.top || 15) * PT;
    const mb = (margin.bottom || 18) * PT;
    const x0 = ml;
    const w  = PW - ml - mr;
    let y    = mt;

    doc.rect(x0, y, w, 24 * PT).fillAndStroke(theme, theme);
    doc.fillColor('white').font(FONT_BOLD).fontSize(11)
      .text(title, x0, y + 7 * PT, { width: w, align: 'center' });
    y += 30 * PT;

    doc.fillColor('#222').font(FONT_REGULAR).fontSize(9);
    for (const line of (text || '').split('\n')) {
      if (y > PH - mb - 20 * PT) break;
      const t = line.trim();
      if (!t) { y += 6 * PT; continue; }
      doc.text(t, x0 + 4 * PT, y, { width: w - 8 * PT });
      y += doc.currentLineHeight(true) + 3 * PT;
    }

    doc.rect(x0 - 2 * PT, mt - 2 * PT, w + 4 * PT, PH - mt - mb + 4 * PT)
      .lineWidth(0.8).strokeColor(theme).stroke();
  }

  // ── Valuer / Examiner page ──────────────────────────────────────────────────

  _drawValuerPage(doc, tmpl, PW, PH, theme, margin) {
    const ml = (margin.left || 15) * PT;
    const mr = (margin.right || 15) * PT;
    const mt = (margin.top || 15) * PT;
    const mb = (margin.bottom || 18) * PT;
    const x0 = ml;
    const w  = PW - ml - mr;
    let y    = mt;

    const vc = tmpl.valuerConfig;
    const labels = vc.labels || DEFAULT_VALUER.labels;
    const columns = vc.columns || DEFAULT_VALUER.columns;
    const valuerCount = vc.count || labels.length;

    // Title
    doc.rect(x0, y, w, 24 * PT).fillAndStroke(theme, theme);
    doc.fillColor('white').font(FONT_BOLD).fontSize(11)
      .text('FOR EXAMINERS USE ONLY', x0, y + 7 * PT, { width: w, align: 'center' });
    y += 32 * PT;

    // Valuer table
    const colCount = columns.length + 1;
    const labelColW = 60 * PT;
    const dataColW = (w - labelColW) / columns.length;
    const rowH = 28 * PT;
    const hdrH = 18 * PT;

    // Header row
    doc.rect(x0, y, labelColW, hdrH).fillColor(this._lightenColor(theme, 0.88)).fill();
    doc.fillColor('#333').font(FONT_BOLD).fontSize(7)
      .text('Valuer', x0 + 3 * PT, y + 5 * PT, { width: labelColW - 6 * PT });
    doc.rect(x0, y, labelColW, hdrH).strokeColor('#888').lineWidth(0.4).stroke();

    for (let c = 0; c < columns.length; c++) {
      const cx = x0 + labelColW + c * dataColW;
      doc.rect(cx, y, dataColW, hdrH).fillColor(this._lightenColor(theme, 0.88)).fill();
      doc.fillColor('#333').font(FONT_BOLD).fontSize(6.5)
        .text(columns[c], cx + 2 * PT, y + 5 * PT, { width: dataColW - 4 * PT, align: 'center' });
      doc.rect(cx, y, dataColW, hdrH).strokeColor('#888').lineWidth(0.4).stroke();
    }
    y += hdrH;

    // Valuer rows
    for (let v = 0; v < valuerCount; v++) {
      const label = labels[v] || `Valuer ${v + 1}`;
      doc.rect(x0, y, labelColW, rowH).strokeColor('#888').lineWidth(0.4).stroke();
      doc.fillColor('#333').font(FONT_BOLD).fontSize(7)
        .text(label, x0 + 3 * PT, y + rowH / 2 - 4 * PT, { width: labelColW - 6 * PT });

      for (let c = 0; c < columns.length; c++) {
        const cx = x0 + labelColW + c * dataColW;
        doc.rect(cx, y, dataColW, rowH).strokeColor('#888').lineWidth(0.4).stroke();
      }
      y += rowH;
    }

    // Total row
    doc.rect(x0, y, labelColW, rowH).fillColor(this._lightenColor(theme, 0.92)).fill();
    doc.fillColor('#333').font(FONT_BOLD).fontSize(8)
      .text('TOTAL', x0 + 3 * PT, y + rowH / 2 - 5 * PT, { width: labelColW - 6 * PT });
    doc.rect(x0, y, labelColW, rowH).strokeColor('#888').lineWidth(0.4).stroke();
    for (let c = 0; c < columns.length; c++) {
      const cx = x0 + labelColW + c * dataColW;
      doc.rect(cx, y, dataColW, rowH).strokeColor('#888').lineWidth(0.4).stroke();
    }
    y += rowH + 16 * PT;

    // Additional instructions if provided
    if (tmpl.instructions3) {
      doc.fillColor('#222').font(FONT_REGULAR).fontSize(9);
      for (const line of tmpl.instructions3.split('\n')) {
        if (y > PH - mb - 20 * PT) break;
        const t = line.trim();
        if (!t) { y += 6 * PT; continue; }
        doc.text(t, x0 + 4 * PT, y, { width: w - 8 * PT });
        y += doc.currentLineHeight(true) + 3 * PT;
      }
    }

    // Border
    doc.rect(x0 - 2 * PT, mt - 2 * PT, w + 4 * PT, PH - mt - mb + 4 * PT)
      .lineWidth(0.8).strokeColor(theme).stroke();
  }

  // ── Answer page ─────────────────────────────────────────────────────────────

  async _drawAnswerPage(doc, tmpl, pageNo, PW, PH, theme, margin, footer) {
    const ml = (margin.left || 25) * PT;
    const mr = (margin.right || 15) * PT;
    const mt = (margin.top || 15) * PT;
    const mb = (margin.bottom || 18) * PT;
    const footerH = footer.show ? (footer.height || 12) * PT : 0;

    const encodeValue = `${tmpl.templateId}/${pageNo}`;

    // Generate barcode & QR
    let barcodeBuf = null;
    let qrBuf      = null;
    try {
      const bwipjs = await import('bwip-js');
      const bwip   = bwipjs.default ?? bwipjs;
      if (tmpl.showBarcode) {
        barcodeBuf = await bwip.toBuffer({
          bcid: 'code128', text: encodeValue,
          scale: 2, height: 8, includetext: false, padding: 1,
        });
      }
      if (tmpl.showQrCode) {
        qrBuf = await bwip.toBuffer({
          bcid: 'qrcode', text: encodeValue, scale: 3, padding: 1,
        });
      }
    } catch (e) {
      logger.warn(`bwip-js failed page ${pageNo}: ${e.message}`);
    }

    // Left margin strip
    doc.moveTo(ml, 0).lineTo(ml, PH).strokeColor('#aaa').lineWidth(0.6).stroke();

    // QR code in margin
    let marginY = mt + 4 * PT;
    const qrSize = 20 * PT;
    if (qrBuf) {
      doc.image(qrBuf, 2 * PT, marginY, { width: qrSize, height: qrSize });
      marginY += qrSize + 4 * PT;
    } else if (tmpl.showQrCode) {
      doc.rect(2 * PT, marginY, qrSize, qrSize).strokeColor('#bbb').stroke();
      doc.fillColor('#bbb').font(FONT_REGULAR).fontSize(4)
        .text('QR', 2 * PT, marginY + qrSize / 2 - 3 * PT, { width: qrSize, align: 'center' });
      marginY += qrSize + 4 * PT;
    }

    // Barcode in margin (rotated)
    const midY = (marginY + PH - mb - footerH) / 2;
    if (barcodeBuf) {
      doc.save();
      doc.translate(ml / 2, midY);
      doc.rotate(-90, { origin: [0, 0] });
      const bcW = Math.min(60 * PT, PH * 0.3);
      doc.image(barcodeBuf, -bcW / 2, -6 * PT, { width: bcW });
      doc.restore();
    } else if (tmpl.showBarcode) {
      doc.fillColor('#bbb').font(FONT_REGULAR).fontSize(5)
        .text(encodeValue, 0, midY - 8 * PT, { width: ml, align: 'center' });
    }

    // Page number in margin
    doc.fillColor('#555').font(FONT_BOLD).fontSize(9)
      .text(String(pageNo), 0, PH - mb - footerH - 16 * PT, { width: ml, align: 'center' });

    // Top header
    const HEADER_H = 20 * PT;
    doc.rect(ml, 0, PW - ml, HEADER_H).fillColor(this._lightenColor(theme, 0.92)).fill();
    doc.fillColor('#333').font(FONT_BOLD).fontSize(8)
      .text(tmpl.templateName, ml + 4 * PT, 6 * PT,
            { width: PW - ml - mr - 70 * PT });
    doc.fillColor('#333').font(FONT_BOLD).fontSize(8)
      .text(`Page ${pageNo} / ${tmpl.totalAnswerPages}`,
            PW - mr - 65 * PT, 6 * PT, { width: 60 * PT, align: 'right' });
    doc.moveTo(ml, HEADER_H).lineTo(PW, HEADER_H).strokeColor('#999').lineWidth(0.4).stroke();

    // Writing area
    const areaLeft   = ml + 4 * PT;
    const areaRight  = PW - mr;
    const areaWidth  = areaRight - areaLeft;
    const areaTop    = HEADER_H + 4 * PT;
    const areaBottom = PH - mb - footerH;
    const areaHeight = areaBottom - areaTop;

    const blocks = this._resolveLayout(tmpl.answerPageLayout, areaHeight);
    let blockY = areaTop;

    for (const block of blocks) {
      const bH = block.heightPt;
      if (blockY + bH > areaBottom + 2 * PT) break;

      if (block.label) {
        doc.fillColor('#888').font(FONT_REGULAR).fontSize(7)
          .text(block.label, areaLeft, blockY + 2 * PT, { width: areaWidth });
        blockY += 10 * PT;
      }

      switch (block.type) {
        case 'lines': {
          const spacing = (block.lineSpacingMm || 8.5) * PT;
          doc.strokeColor('#ccc').lineWidth(0.35);
          for (let ly = blockY + spacing; ly < blockY + bH - 1; ly += spacing) {
            doc.moveTo(areaLeft, ly).lineTo(areaRight, ly).stroke();
          }
          break;
        }
        case 'box':
          doc.rect(areaLeft, blockY, areaWidth, bH).strokeColor('#aaa').lineWidth(0.5).stroke();
          break;
        case 'blank':
        default:
          break;
      }
      blockY += bH;
      if (blockY < areaBottom - 2 * PT) {
        doc.moveTo(areaLeft, blockY).lineTo(areaRight, blockY)
          .strokeColor('#e0e0e0').lineWidth(0.3).stroke();
      }
    }

    // Footer bar
    if (footer.show) {
      this._drawFooterBar(doc, tmpl, pageNo, PW, PH, theme, margin, footer);
    }

    // Outer border
    doc.rect(ml, 0, PW - ml, PH).lineWidth(0.8).strokeColor(theme).stroke();
  }

  // ── Footer bar ──────────────────────────────────────────────────────────────

  _drawFooterBar(doc, tmpl, pageNo, PW, PH, theme, margin, footer) {
    const ml = (margin.left || 25) * PT;
    const mr = (margin.right || 15) * PT;
    const fH = (footer.height || 12) * PT;
    const fY = PH - (margin.bottom || 18) * PT - fH;
    const fW = PW - ml - mr;

    doc.rect(ml, fY, fW, fH).fillColor(this._lightenColor(theme, 0.95)).fill();
    doc.moveTo(ml, fY).lineTo(ml + fW, fY).strokeColor('#ccc').lineWidth(0.4).stroke();

    doc.fillColor('#666').font(FONT_REGULAR).fontSize(6);
    if (footer.showSerial && tmpl.serialNumberPrefix) {
      doc.text(`${tmpl.serialNumberPrefix}________`, ml + 4 * PT, fY + fH / 2 - 3 * PT);
    }
    if (footer.showPageNo) {
      doc.text(`Page ${pageNo} of ${tmpl.totalAnswerPages}`,
        ml + fW - 60 * PT, fY + fH / 2 - 3 * PT, { width: 56 * PT, align: 'right' });
    }
  }

  // ── Rough work page ─────────────────────────────────────────────────────────

  _drawRoughWorkPage(doc, pageNo, total, PW, PH, theme, margin, footer) {
    const ml = (margin.left || 25) * PT;
    const mr = (margin.right || 15) * PT;
    const mt = (margin.top || 15) * PT;
    const mb = (margin.bottom || 18) * PT;
    const x0 = ml;
    const w  = PW - ml - mr;

    // Left margin line
    doc.moveTo(ml, 0).lineTo(ml, PH).strokeColor('#aaa').lineWidth(0.6).stroke();

    // Header
    const HEADER_H = 20 * PT;
    doc.rect(ml, 0, PW - ml, HEADER_H).fillColor(this._lightenColor(theme, 0.92)).fill();
    doc.fillColor('#888').font(FONT_BOLD).fontSize(9)
      .text('ROUGH WORK / SPACE FOR ROUGH WORK', ml + 4 * PT, 6 * PT,
            { width: w - 70 * PT });
    doc.fillColor('#888').font(FONT_REGULAR).fontSize(7)
      .text(`${pageNo} / ${total}`, PW - mr - 40 * PT, 7 * PT, { width: 36 * PT, align: 'right' });
    doc.moveTo(ml, HEADER_H).lineTo(PW, HEADER_H).strokeColor('#ccc').lineWidth(0.4).stroke();

    // Light crossed lines for rough work
    const areaTop = HEADER_H + 4 * PT;
    const footerH = footer.show ? (footer.height || 12) * PT : 0;
    const areaBottom = PH - mb - footerH;

    doc.strokeColor('#e8e8e8').lineWidth(0.25);
    const spacing = 8.5 * PT;
    for (let ly = areaTop + spacing; ly < areaBottom; ly += spacing) {
      doc.moveTo(x0 + 4 * PT, ly).lineTo(PW - mr, ly).stroke();
    }

    // Outer border
    doc.rect(ml, 0, PW - ml, PH).lineWidth(0.8).strokeColor(theme).stroke();
  }

  // ── Layout resolver ─────────────────────────────────────────────────────────

  _resolveLayout(layout, totalHeightPt) {
    if (!Array.isArray(layout) || layout.length === 0) {
      return [{ type: 'lines', heightPt: totalHeightPt, lineSpacingMm: 8.5, label: '' }];
    }
    const blocks = layout.map(b => ({ ...b }));
    let fixed = 0, flex = 0;
    for (const b of blocks) {
      if (b.heightMm > 0) { b.heightPt = b.heightMm * PT; fixed += b.heightPt; }
      else { b.heightPt = 0; flex++; }
    }
    const remaining = Math.max(totalHeightPt - fixed, 0);
    const flexPt = flex > 0 ? remaining / flex : 0;
    for (const b of blocks) { if (b.heightPt === 0) b.heightPt = flexPt; }
    return blocks;
  }

  // ── Color utility ───────────────────────────────────────────────────────────

  _lightenColor(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const lr = Math.round(r + (255 - r) * factor);
    const lg = Math.round(g + (255 - g) * factor);
    const lb = Math.round(b + (255 - b) * factor);
    return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
  }

  // ── Normalise DB row → camelCase ────────────────────────────────────────────

  _normalise(row) {
    const parseJson = (val, fallback = null) => {
      if (val == null) return fallback;
      if (typeof val === 'object') return val;
      try { return JSON.parse(val); } catch { return fallback; }
    };

    const coverFields = parseJson(row.CoverFields ?? row.coverFields, DEFAULT_COVER_FIELDS);

    return {
      templateId:         row.TemplateID        ?? row.templateId,
      templateName:       row.TemplateName       ?? row.templateName,
      paperSize:          row.PaperSize          ?? row.paperSize      ?? 'A4',
      themeColor:         row.ThemeColor         ?? row.themeColor     ?? '#1a3a6b',
      orgName:            row.OrgName            ?? row.orgName        ?? '',
      orgNameSecondary:   row.OrgNameSecondary   ?? row.orgNameSecondary ?? '',
      orgCode:            row.OrgCode            ?? row.orgCode        ?? '',
      logoPath:           row.LogoPath           ?? row.logoPath       ?? '',
      paperCode:          row.PaperCode          ?? row.paperCode      ?? '',
      serialNumberPrefix: row.SerialNumberPrefix ?? row.serialNumberPrefix ?? '',
      examId:             row.ExamID             ?? row.examId,
      examName:           row.ExamName           ?? row.examName,
      examCode:           row.ExamCode           ?? row.examCode,
      coverFields,
      instructions2:      row.Instructions2      ?? row.instructions2  ?? '',
      instructions3:      row.Instructions3      ?? row.instructions3  ?? '',
      totalAnswerPages:   row.TotalAnswerPages   ?? row.totalAnswerPages ?? 24,
      pageStyle:          row.PageStyle          ?? row.pageStyle      ?? 'lined',
      showBarcode:        row.ShowBarcode         ?? row.showBarcode    ?? 1,
      showQrCode:         row.ShowQrCode          ?? row.showQrCode    ?? 1,
      answerPageLayout:   parseJson(row.AnswerPageLayout ?? row.answerPageLayout),
      valuerConfig:       parseJson(row.ValuerConfig ?? row.valuerConfig, { ...DEFAULT_VALUER }),
      questionMapping:    parseJson(row.QuestionMapping ?? row.questionMapping, { show: false, questions: 0 }),
      registrationMarks:  parseJson(row.RegistrationMarks ?? row.registrationMarks, { ...DEFAULT_REG_MARKS }),
      roughWorkPages:     row.RoughWorkPages     ?? row.roughWorkPages ?? 0,
      marginConfig:       parseJson(row.MarginConfig ?? row.marginConfig, { ...DEFAULT_MARGIN }),
      footerConfig:       parseJson(row.FooterConfig ?? row.footerConfig, { ...DEFAULT_FOOTER }),
      coverBarcodePos:    row.CoverBarcodePos    ?? row.coverBarcodePos ?? 'left',
      coverLayout:        parseJson(row.CoverLayout ?? row.coverLayout),
      isActive:           row.IsActive           ?? row.isActive       ?? 1,
      createdAt:          row.CreatedAt          ?? row.createdAt,
      modifiedAt:         row.ModifiedAt         ?? row.modifiedAt,
    };
  }
}
