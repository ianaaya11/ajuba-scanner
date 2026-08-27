import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Rasterises an existing PDF so its pages can be reordered, annotated and
 * re-exported alongside fresh scans.
 */
export async function pdfToCanvases(
  file: Blob,
  onProgress?: (done: number, total: number) => void,
): Promise<HTMLCanvasElement[]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const canvases: HTMLCanvasElement[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    // 2x the natural size keeps small type legible after re-encoding.
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    canvases.push(canvas);
    onProgress?.(i, doc.numPages);
  }
  await doc.destroy();
  return canvases;
}

/** Opens a picker for PDFs and images alike — the library imports both. */
export function pickDocuments(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.multiple = true;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

export const isPdf = (file: Blob) =>
  file.type === 'application/pdf' || (file instanceof File && file.name.toLowerCase().endsWith('.pdf'));
