import { imageDataToCanvas } from './image';

/**
 * Lays the two sides of a card onto one portrait page, the way a photocopied
 * ID is usually presented: both sides, one sheet, in reading order.
 *
 * Sides keep their own proportions — a driving licence and its back are the
 * same shape, but a passport page paired with anything is not.
 */
export function composeSides(sides: ImageData[]): ImageData {
  const canvases = sides.map(imageDataToCanvas);

  // A4 proportions at a working resolution, so the sheet matches every other
  // page in the document.
  const width = 1240;
  const height = Math.round(width * 1.414);
  const margin = Math.round(width * 0.07);
  const gap = Math.round(width * 0.05);

  const page = document.createElement('canvas');
  page.width = width;
  page.height = height;
  const ctx = page.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';

  const usable = width - margin * 2;
  // Scale every side to the same width, then stack them from the top.
  const heights = canvases.map((c) => (usable / c.width) * c.height);
  const total = heights.reduce((a, b) => a + b, 0) + gap * (canvases.length - 1);

  // If the stack would run past the sheet, shrink it to fit rather than crop.
  const fit = Math.min(1, (height - margin * 2) / total);
  let y = margin + Math.max(0, (height - margin * 2 - total * fit) / 2);

  canvases.forEach((c, i) => {
    const w = usable * fit;
    const h = heights[i] * fit;
    const x = (width - w) / 2;
    // A hairline edge, so a white card on white paper still reads as a card.
    ctx.strokeStyle = 'rgba(0,0,0,.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    ctx.drawImage(c, x, y, w, h);
    y += h + gap * fit;
  });

  return ctx.getImageData(0, 0, width, height);
}
