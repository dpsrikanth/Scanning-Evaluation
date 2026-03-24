import logger from '../../utils/logger.js';

// Points per mm  (1 pt = 1/72 inch)
const PT = 72 / 25.4;

// Paper dimensions in points
const PAPER = {
  A4:    { w: 210 * PT, h: 297 * PT, pdfSize: 'A4'         },
  Legal: { w: 216 * PT, h: 356 * PT, pdfSize: [612, 1008]  },
};

// Layout constants (mm → pt)
const MARGIN_TOP    = 15  * PT;
const MARGIN_OUTER  = 15  * PT;
const MARGIN_BOTTOM = 18  * PT;
const MARGIN_LEFT   = 25  * PT;   // wide left margin strip for barcode / QR
const FIELD_H       = 22  * PT;
const FONT_REGULAR  = 'Helvetica';
const FONT_BOLD     = 'Helvetica-Bold';

// Default layout blocks when none configured
const DEFAULT_LAYOUT = [
  { type: 'lines', heightMm: 0, lineSpacingMm: 8.5, label: '' },
];

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

  async list()          { return this.repo.list(); }
  async listExams()     { return this.repo.listExams(); }

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
    const tmpl   = await this.getById(id);
    const paper  = PAPER[tmpl.paperSize] || PAPER.A4;
    const PW     = paper.w;
    const PH     = paper.h;

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

    // Page 1 — cover
    doc.addPage();
    this._drawCoverPage(doc, tmpl, fields, PW, PH);

    // Page 2 — instructions
    if (tmpl.instructions2) {
      doc.addPage();
      this._drawInstructionsPage(doc, 'INSTRUCTIONS', tmpl.instructions2, PW, PH);
    }

    // Page 3 — more instructions (optional)
    if (tmpl.instructions3) {
      doc.addPage();
      this._drawInstructionsPage(doc, 'INSTRUCTIONS (continued)', tmpl.instructions3, PW, PH);
    }

    // Answer pages
    for (let pg = 1; pg <= tmpl.totalAnswerPages; pg++) {
      doc.addPage();
      await this._drawAnswerPage(doc, tmpl, pg, PW, PH);
    }

    doc.end();
    logger.info(`Answer sheet PDF generated templateId=${id} paper=${tmpl.paperSize} pages=${tmpl.totalAnswerPages}`);
  }

  // ── Cover page ──────────────────────────────────────────────────────────────

  _drawCoverPage(doc, tmpl, fields, PW, PH) {
    const x0 = MARGIN_OUTER;
    const w  = PW - 2 * MARGIN_OUTER;
    let y    = MARGIN_TOP;

    doc.rect(x0, y, w, 30 * PT).fillAndStroke('#1a3a6b', '#1a3a6b');
    doc.fillColor('white').font(FONT_BOLD).fontSize(14)
      .text('ANSWER BOOKLET', x0, y + 8 * PT, { width: w, align: 'center' });
    y += 35 * PT;

    const examLabel = tmpl.examName
      ? `${tmpl.examCode ? tmpl.examCode + ' — ' : ''}${tmpl.examName}` : 'Examination';
    doc.fillColor('#333').font(FONT_BOLD).fontSize(9)
      .text(examLabel, x0, y, { width: w, align: 'center' });
    y += 12 * PT;

    doc.moveTo(x0, y).lineTo(x0 + w, y).strokeColor('#1a3a6b').lineWidth(0.8).stroke();
    y += 8 * PT;

    doc.lineWidth(0.5).strokeColor('#555');
    let i = 0;
    while (i < fields.length) {
      const f    = fields[i];
      const next = fields[i + 1];
      const full = f.layout === 'full' || !next || next.layout === 'full';
      if (full) {
        this._drawField(doc, f.label, x0, y, w, FIELD_H);
        i++;
      } else {
        const hw = (w - 4 * PT) / 2;
        this._drawField(doc, f.label,      x0,               y, hw, FIELD_H);
        this._drawField(doc, next.label,   x0 + hw + 4 * PT, y, hw, FIELD_H);
        i += 2;
      }
      y += FIELD_H + 4 * PT;
    }

    y += 8 * PT;
    doc.moveTo(x0, y).lineTo(x0 + w, y).strokeColor('#aaa').lineWidth(0.4).stroke();
    y += 6 * PT;
    const sigW = w / 3 - 4 * PT;
    ['Invigilator Signature', 'Room No / Seat No', 'For Official Use Only'].forEach((lbl, idx) => {
      const sx = x0 + idx * (sigW + 6 * PT);
      doc.fillColor('#888').font(FONT_REGULAR).fontSize(7)
        .text(lbl, sx, y, { width: sigW, align: 'center' });
      doc.rect(sx, y + 10 * PT, sigW, 18 * PT).stroke();
    });

    doc.rect(x0 - 2 * PT, MARGIN_TOP - 2 * PT, w + 4 * PT, PH - 2 * MARGIN_TOP)
      .lineWidth(0.8).strokeColor('#1a3a6b').stroke();
  }

  _drawField(doc, label, x, y, w, h) {
    doc.rect(x, y, w, h).strokeColor('#555').lineWidth(0.5).stroke();
    const lw = Math.min(w * 0.38, 100 * PT);
    doc.rect(x, y, lw, h).fillColor('#f0f4ff').fill();
    doc.fillColor('#333').font(FONT_BOLD).fontSize(7)
      .text(label, x + 3 * PT, y + (h / 2) - 4 * PT, { width: lw - 6 * PT, ellipsis: true });
    doc.moveTo(x + lw, y).lineTo(x + lw, y + h).strokeColor('#aaa').lineWidth(0.4).stroke();
  }

  // ── Instructions page ───────────────────────────────────────────────────────

  _drawInstructionsPage(doc, title, text, PW, PH) {
    const x0 = MARGIN_OUTER;
    const w  = PW - 2 * MARGIN_OUTER;
    let y    = MARGIN_TOP;

    doc.rect(x0, y, w, 24 * PT).fillAndStroke('#1a3a6b', '#1a3a6b');
    doc.fillColor('white').font(FONT_BOLD).fontSize(11)
      .text(title, x0, y + 7 * PT, { width: w, align: 'center' });
    y += 30 * PT;

    doc.fillColor('#222').font(FONT_REGULAR).fontSize(9);
    for (const line of (text || '').split('\n')) {
      if (y > PH - MARGIN_BOTTOM - 20 * PT) break;
      const t = line.trim();
      if (!t) { y += 6 * PT; continue; }
      doc.text(t, x0 + 4 * PT, y, { width: w - 8 * PT });
      y += doc.currentLineHeight(true) + 3 * PT;
    }

    doc.rect(x0 - 2 * PT, MARGIN_TOP - 2 * PT, w + 4 * PT, PH - 2 * MARGIN_TOP)
      .lineWidth(0.8).strokeColor('#1a3a6b').stroke();
  }

  // ── Answer page ─────────────────────────────────────────────────────────────

  async _drawAnswerPage(doc, tmpl, pageNo, PW, PH) {
    const encodeValue = `${tmpl.templateId}/${pageNo}`;

    // ── Generate barcode & QR images ────────────────────────────────────────
    let barcodeBuf = null;
    let qrBuf      = null;
    try {
      const bwipjs = await import('bwip-js');
      const bwip   = bwipjs.default ?? bwipjs;

      if (tmpl.showBarcode) {
        barcodeBuf = await bwip.toBuffer({
          bcid:        'code128',
          text:        encodeValue,
          scale:       2,
          height:      8,
          includetext: false,
          padding:     1,
        });
      }
      if (tmpl.showQrCode) {
        qrBuf = await bwip.toBuffer({
          bcid:        'qrcode',
          text:        encodeValue,
          scale:       3,
          padding:     1,
        });
      }
    } catch (e) {
      logger.warn(`bwip-js failed page ${pageNo}: ${e.message}`);
    }

    // ── Left margin strip ────────────────────────────────────────────────────
    doc.moveTo(MARGIN_LEFT, 0).lineTo(MARGIN_LEFT, PH)
      .strokeColor('#aaa').lineWidth(0.6).stroke();

    // QR code — top of margin
    let marginY = MARGIN_TOP + 4 * PT;
    const qrSize = 20 * PT;
    if (qrBuf) {
      doc.image(qrBuf, 2 * PT, marginY, { width: qrSize, height: qrSize });
      marginY += qrSize + 4 * PT;
    } else if (tmpl.showQrCode) {
      doc.rect(2 * PT, marginY, qrSize, qrSize).stroke();
      doc.fillColor('#bbb').font(FONT_REGULAR).fontSize(4)
        .text('QR', 2 * PT, marginY + qrSize / 2 - 3 * PT, { width: qrSize, align: 'center' });
      marginY += qrSize + 4 * PT;
    }

    // Barcode — below QR, rotated 90° in left margin
    const midY = (marginY + PH - MARGIN_BOTTOM) / 2;
    if (barcodeBuf) {
      doc.save();
      doc.translate(MARGIN_LEFT / 2, midY);
      doc.rotate(-90, { origin: [0, 0] });
      const bcW = Math.min(60 * PT, PH * 0.3);
      doc.image(barcodeBuf, -bcW / 2, -6 * PT, { width: bcW });
      doc.restore();
    } else if (tmpl.showBarcode) {
      doc.fillColor('#bbb').font(FONT_REGULAR).fontSize(5)
        .text(encodeValue, 0, midY - 8 * PT, { width: MARGIN_LEFT, align: 'center' });
    }

    // Page number at bottom of left margin
    doc.fillColor('#555').font(FONT_BOLD).fontSize(9)
      .text(String(pageNo), 0, PH - 28 * PT, { width: MARGIN_LEFT, align: 'center' });

    // ── Top header strip ─────────────────────────────────────────────────────
    const HEADER_H = 20 * PT;
    doc.rect(MARGIN_LEFT, 0, PW - MARGIN_LEFT, HEADER_H).fillColor('#f0f4ff').fill();
    doc.fillColor('#333').font(FONT_BOLD).fontSize(8)
      .text(tmpl.templateName, MARGIN_LEFT + 4 * PT, 6 * PT,
            { width: PW - MARGIN_LEFT - MARGIN_OUTER - 70 * PT });
    doc.fillColor('#333').font(FONT_BOLD).fontSize(8)
      .text(`Page ${pageNo} / ${tmpl.totalAnswerPages}`,
            PW - MARGIN_OUTER - 65 * PT, 6 * PT, { width: 60 * PT, align: 'right' });
    doc.moveTo(MARGIN_LEFT, HEADER_H).lineTo(PW, HEADER_H)
      .strokeColor('#999').lineWidth(0.4).stroke();

    // ── Writing area ─────────────────────────────────────────────────────────
    const areaLeft   = MARGIN_LEFT + 4 * PT;
    const areaRight  = PW - MARGIN_OUTER;
    const areaWidth  = areaRight - areaLeft;
    const areaTop    = HEADER_H + 4 * PT;
    const areaBottom = PH - MARGIN_BOTTOM;
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
        case 'box': {
          doc.rect(areaLeft, blockY, areaWidth, bH)
            .strokeColor('#aaa').lineWidth(0.5).stroke();
          break;
        }
        case 'blank':
        default:
          break;
      }

      blockY += bH;

      // Light separator between blocks
      if (blockY < areaBottom - 2 * PT) {
        doc.moveTo(areaLeft, blockY).lineTo(areaRight, blockY)
          .strokeColor('#e0e0e0').lineWidth(0.3).stroke();
      }
    }

    // Outer border for writing area
    doc.rect(MARGIN_LEFT, 0, PW - MARGIN_LEFT, PH)
      .lineWidth(0.8).strokeColor('#1a3a6b').stroke();
  }

  // ── Layout resolver ─────────────────────────────────────────────────────────
  // Converts AnswerPageLayout JSON blocks into concrete heightPt values.
  // Blocks with heightMm === 0 share the remaining space equally.
  _resolveLayout(layout, totalHeightPt) {
    if (!Array.isArray(layout) || layout.length === 0) {
      return [{ type: 'lines', heightPt: totalHeightPt, lineSpacingMm: 8.5, label: '' }];
    }

    const blocks = layout.map(b => ({ ...b }));
    let fixed = 0;
    let flex  = 0;

    for (const b of blocks) {
      if (b.heightMm > 0) {
        b.heightPt = b.heightMm * PT;
        fixed += b.heightPt;
      } else {
        b.heightPt = 0;
        flex++;
      }
    }

    const remaining = Math.max(totalHeightPt - fixed, 0);
    const flexPt    = flex > 0 ? remaining / flex : 0;

    for (const b of blocks) {
      if (b.heightPt === 0) b.heightPt = flexPt;
    }

    return blocks;
  }

  // ── Normalise DB row → camelCase ────────────────────────────────────────────

  _normalise(row) {
    let coverFields = row.CoverFields ?? row.coverFields;
    if (typeof coverFields === 'string') {
      try { coverFields = JSON.parse(coverFields); } catch { coverFields = DEFAULT_COVER_FIELDS; }
    }
    coverFields = coverFields ?? DEFAULT_COVER_FIELDS;

    let answerPageLayout = row.AnswerPageLayout ?? row.answerPageLayout ?? null;
    if (typeof answerPageLayout === 'string') {
      try { answerPageLayout = JSON.parse(answerPageLayout); } catch { answerPageLayout = null; }
    }

    return {
      templateId:       row.TemplateID       ?? row.templateId,
      templateName:     row.TemplateName     ?? row.templateName,
      paperSize:        row.PaperSize        ?? row.paperSize   ?? 'A4',
      examId:           row.ExamID           ?? row.examId,
      examName:         row.ExamName         ?? row.examName,
      examCode:         row.ExamCode         ?? row.examCode,
      coverFields,
      instructions2:    row.Instructions2    ?? row.instructions2 ?? '',
      instructions3:    row.Instructions3    ?? row.instructions3 ?? '',
      totalAnswerPages: row.TotalAnswerPages ?? row.totalAnswerPages ?? 24,
      pageStyle:        row.PageStyle        ?? row.pageStyle   ?? 'lined',
      showBarcode:      row.ShowBarcode      ?? row.showBarcode ?? 1,
      showQrCode:       row.ShowQrCode       ?? row.showQrCode  ?? 1,
      answerPageLayout,
      isActive:         row.IsActive         ?? row.isActive ?? 1,
      createdAt:        row.CreatedAt        ?? row.createdAt,
      modifiedAt:       row.ModifiedAt       ?? row.modifiedAt,
    };
  }
}
