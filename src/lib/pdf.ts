import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Annotation, Doc, Page } from '../types';
import { displaySize, isStroke, rotatePoint } from './annotations';
import { blobToImageData, canvasToBlob, imageDataToCanvas, rotateCanvas } from './image';
import { getBlob } from './db';

/** pdf-lib's standard fonts are WinAnsi only; drop anything they cannot encode. */
function winAnsiSafe(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Renders a stored page to a canvas with its rotation baked in. */
export async function renderPageCanvas(page: Page): Promise<HTMLCanvasElement> {
  const blob = await getBlob(page.imageKey);
  if (!blob) throw new Error('Page image is missing');
  return rotateCanvas(imageDataToCanvas(await blobToImageData(blob)), page.rotation);
}

function drawAnnotations(
  pdfPage: PDFPage,
  annotations: Annotation[],
  page: Page,
  font: PDFFont,
) {
  const { width: pw, height: ph } = pdfPage.getSize();
  // Sizes are stored against the unrotated page height, keeping them constant
  // in absolute terms however the page is turned.
  const view = displaySize(page.width, page.height, page.rotation);
  const pxToPdf = pw / view.width;

  for (const a of annotations) {
    if (isStroke(a)) {
      const points = a.points.map((p) => {
        const r = rotatePoint(p, page.rotation);
        return { x: r.x * pw, y: ph - r.y * ph };
      });
      const thickness = Math.max(0.5, a.width * page.height * pxToPdf);
      const options = {
        thickness,
        color: hexToRgb(a.color),
        opacity: a.kind === 'highlight' ? 0.35 : 1,
        lineCap: 1 as const,
      };
      if (points.length === 1) {
        pdfPage.drawCircle({ x: points[0].x, y: points[0].y, size: thickness / 2, color: hexToRgb(a.color), opacity: options.opacity });
        continue;
      }
      for (let i = 1; i < points.length; i++) {
        pdfPage.drawLine({ start: points[i - 1], end: points[i], ...options });
      }
    } else {
      const r = rotatePoint(a.at, page.rotation);
      const size = Math.max(4, a.size * page.height * pxToPdf);
      const lines = winAnsiSafe(a.text).split('\n');
      lines.forEach((line, i) => {
        pdfPage.drawText(line, {
          x: r.x * pw,
          y: ph - r.y * ph - size - i * size * 1.25,
          size,
          font,
          color: hexToRgb(a.color),
        });
      });
    }
  }
}

/**
 * Lays OCR text over the image at zero opacity so the PDF is searchable and
 * text can be selected and copied, while looking exactly like the scan.
 */
function drawTextLayer(pdfPage: PDFPage, page: Page, font: PDFFont) {
  if (!page.ocrWords?.length) return;
  const { width: pw, height: ph } = pdfPage.getSize();

  for (const word of page.ocrWords) {
    const text = winAnsiSafe(word.text);
    if (!text) continue;
    const topLeft = rotatePoint({ x: word.x0, y: word.y0 }, page.rotation);
    const bottomRight = rotatePoint({ x: word.x1, y: word.y1 }, page.rotation);
    const x = Math.min(topLeft.x, bottomRight.x) * pw;
    const yTop = Math.min(topLeft.y, bottomRight.y) * ph;
    const boxHeight = Math.abs(bottomRight.y - topLeft.y) * ph;
    const boxWidth = Math.abs(bottomRight.x - topLeft.x) * pw;
    if (boxHeight < 1 || boxWidth < 1) continue;

    // Shrink the font so the invisible word spans the same width as the ink.
    const measured = font.widthOfTextAtSize(text, boxHeight);
    const size = measured > 0 ? Math.min(boxHeight, (boxHeight * boxWidth) / measured) : boxHeight;
    pdfPage.drawText(text, {
      x,
      y: ph - yTop - boxHeight * 0.82,
      size,
      font,
      opacity: 0,
    });
  }
}

export interface BuildOptions {
  /** JPEG quality for the embedded page images. */
  quality?: number;
  onProgress?: (done: number, total: number) => void;
}

/** Builds the finished PDF: one page per scan, annotations and OCR layer included. */
export async function buildPdf(doc: Doc, options: BuildOptions = {}): Promise<Uint8Array> {
  const { quality = 0.85, onProgress } = options;
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.name);
  pdf.setCreator('Recto');
  pdf.setProducer('Recto');
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const [index, page] of doc.pages.entries()) {
    const canvas = await renderPageCanvas(page);
    const jpeg = await canvasToBlob(canvas, quality);
    const image = await pdf.embedJpg(await jpeg.arrayBuffer());

    // Fit the scan to A4 at 72dpi, preserving its aspect ratio.
    const a4 = { width: 595.28, height: 841.89 };
    const landscape = image.width > image.height;
    const sheet = landscape ? { width: a4.height, height: a4.width } : a4;
    const scale = Math.min(sheet.width / image.width, sheet.height / image.height);
    const w = image.width * scale;
    const h = image.height * scale;

    const pdfPage = pdf.addPage([w, h]);
    pdfPage.drawImage(image, { x: 0, y: 0, width: w, height: h });
    drawTextLayer(pdfPage, page, font);
    drawAnnotations(pdfPage, page.annotations, page, font);
    onProgress?.(index + 1, doc.pages.length);
  }

  return pdf.save();
}

export function pdfFilename(name: string): string {
  const safe = name.replace(/[^\w\d\- ]+/g, '').trim() || 'scan';
  return `${safe}.pdf`;
}
