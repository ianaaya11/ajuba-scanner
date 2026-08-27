import { createWorker, type Worker } from 'tesseract.js';
import type { OcrWord } from '../types';

let workerPromise: Promise<Worker> | null = null;

/**
 * Everything Tesseract needs ships with the app, so OCR works with no network.
 * `import.meta.env.BASE_URL` keeps the paths right under the Android WebView,
 * which serves the bundle from a non-root origin.
 */
const base = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/tesseract`;

/** One shared worker — loading the language data is the expensive part. */
function worker(onProgress?: (ratio: number) => void) {
  workerPromise ??= createWorker('eng', 1, {
    workerPath: `${base}/worker.min.js`,
    corePath: base,
    langPath: base,
    // The model ships uncompressed; see scripts/fetch-ocr-assets.mjs.
    gzip: false,
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress);
    },
  });
  return workerPromise;
}

export interface OcrResult {
  text: string;
  words: OcrWord[];
}

/**
 * Recognises text on a rendered page. Word boxes come back in pixels and are
 * normalised here so they survive any later rescaling.
 */
export async function recognise(
  canvas: HTMLCanvasElement,
  onProgress?: (ratio: number) => void,
): Promise<OcrResult> {
  const w = await worker(onProgress);
  const { data } = await w.recognize(canvas, {}, { blocks: true });

  const words: OcrWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          if (!word.text.trim() || word.confidence < 40) continue;
          words.push({
            text: word.text,
            x0: word.bbox.x0 / canvas.width,
            y0: word.bbox.y0 / canvas.height,
            x1: word.bbox.x1 / canvas.width,
            y1: word.bbox.y1 / canvas.height,
          });
        }
      }
    }
  }
  return { text: data.text.trim(), words };
}

export async function shutdownOcr(): Promise<void> {
  if (!workerPromise) return;
  const w = await workerPromise;
  workerPromise = null;
  await w.terminate();
}
