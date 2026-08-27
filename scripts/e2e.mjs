/**
 * End-to-end run of the whole pipeline against a synthetic photo: capture ->
 * edge detection -> crop -> filter -> save -> export PDF. Reports how close the
 * detected page corners are to the known truth, and validates the exported PDF.
 */
import puppeteer from 'puppeteer-core';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';

// pdfjs touches a few browser globals as it loads; stub the ones Node lacks.
globalThis.DOMMatrix ??= class { multiply() { return this; } };
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

/** Pulls the text layer out of a PDF exactly as a reader's search would. */
async function extractText(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    text += content.items.map((it) => it.str).join(' ') + '\n';
  }
  await doc.destroy();
  return text;
}

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE ?? 'http://127.0.0.1:4191';
const OUT = resolve('./shots');
const DOWNLOADS = resolve('./shots/downloads');
const PHOTO = resolve('./shots/test-photo.png');

// The corners make-test-photo.mjs projected the page onto, in TL,TR,BR,BL order.
const TRUTH = [
  [205, 250],
  [1035, 155],
  [1090, 1425],
  [135, 1330],
];

await mkdir(OUT, { recursive: true });
await rm(DOWNLOADS, { recursive: true, force: true });
await mkdir(DOWNLOADS, { recursive: true });

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-first-run', '--disable-background-networking', '--disable-component-update', '--disable-sync'],
});

const page = await browser.newPage();
page.on('pageerror', (e) => { console.log('  PAGE ERROR:', e.message); failures++; });
await page.setViewport({ width: 1200, height: 950 });

const cdp = await page.createCDPSession();
await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS });

await page.goto(BASE, { waitUntil: 'networkidle0' });

// --- capture ---------------------------------------------------------------
const [chooser] = await Promise.all([
  page.waitForFileChooser({ timeout: 15000 }),
  page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'New scan');
    btn.click();
  }),
]);
await chooser.accept([PHOTO]);

await page.waitForSelector('.stage svg polygon', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: join(OUT, 'flow-1-crop.png') });

const boxes = await page.evaluate(() => {
  const r = (el) => { const b = el.getBoundingClientRect();
    return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
  const canvas = document.querySelector('.stage canvas');
  const svg = document.querySelector('.stage svg');
  return { canvas: r(canvas), svg: r(svg), svgStyle: svg.getAttribute('style') };
});
console.log('  canvas box (l,t,w,h):', boxes.canvas.join(', '));
console.log('  svg box    (l,t,w,h):', boxes.svg.join(', '));
const aligned = boxes.canvas.every((v, i) => Math.abs(v - boxes.svg[i]) <= 1);
check('corner overlay sits exactly on the photo', aligned,
  aligned ? '' : `svg is offset by ${boxes.svg[0] - boxes.canvas[0]}px horizontally`);

// --- detection accuracy ----------------------------------------------------
const points = await page.evaluate(() =>
  document.querySelector('.stage svg polygon').getAttribute('points')
    .trim().split(/\s+/).map((p) => p.split(',').map(Number)),
);
const errors = points.map(([x, y], i) => Math.hypot(x - TRUTH[i][0], y - TRUTH[i][1]));
const worst = Math.max(...errors);
console.log('  detected corners:', points.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join('  '));
console.log('  truth            :', TRUTH.map(([x, y]) => `${x},${y}`).join('  '));
console.log('  corner errors (px):', errors.map((e) => e.toFixed(1)).join(', '));
// The photo is 1200x1600; anything within ~1.5% of the long edge is a good find.
check('page corners detected automatically', worst < 24, `worst error ${worst.toFixed(1)}px`);

// --- crop + filters --------------------------------------------------------
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Crop').click();
});
await page.waitForSelector('.filter-strip', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: join(OUT, 'flow-2-filter-auto.png') });

const straightened = await page.evaluate(() => {
  const c = document.querySelector('.stage canvas');
  return { w: c.width, h: c.height, ratio: +(c.width / c.height).toFixed(3) };
});
console.log('  straightened page:', `${straightened.w}x${straightened.h} (ratio ${straightened.ratio})`);
// The source page was 850x1100 -> 0.773. The warp should recover that shape.
check('perspective corrected to the original aspect', Math.abs(straightened.ratio - 0.773) < 0.06,
  `ratio ${straightened.ratio} vs 0.773`);

for (const label of ['B & W', 'Colour']) {
  await page.evaluate((l) => {
    [...document.querySelectorAll('.chip')].find((c) => c.textContent.trim() === l).click();
  }, label);
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: join(OUT, `flow-2-filter-${label.replace(/\W+/g, '').toLowerCase()}.png`) });
}

// Back to Auto for the saved page.
await page.evaluate(() => {
  [...document.querySelectorAll('.chip')].find((c) => c.textContent.trim() === 'Auto').click();
});
await new Promise((r) => setTimeout(r, 900));

// --- save ------------------------------------------------------------------
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Done').click();
});
await page.waitForSelector('.page-grid', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: join(OUT, 'flow-3-document.png') });
check('scanned page saved into the document',
  (await page.$$('.page-card')).length === 1, `${(await page.$$('.page-card')).length} page(s)`);

// --- OCR -------------------------------------------------------------------
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'OCR').click();
});
await page.waitForFunction(
  () => !document.querySelector('.overlay') && !!document.querySelector('.ocr-flag'),
  { timeout: 180000, polling: 1000 },
).catch(() => {});
const ocrRan = await page.$('.ocr-flag');
check('OCR completed and flagged the page', !!ocrRan);

const ocr = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('recto');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const docs = await new Promise((res, rej) => {
    const t = db.transaction('docs').objectStore('docs').getAll();
    t.onsuccess = () => res(t.result);
    t.onerror = () => rej(t.error);
  });
  const pg = docs.flatMap((d) => d.pages)[0];
  return { text: (pg?.ocrText ?? '').slice(0, 200), words: (pg?.ocrWords ?? []).length };
});
console.log(`  OCR words: ${ocr.words}`);
console.log(`  OCR text : ${JSON.stringify(ocr.text)}`);
check('OCR found words with positions', ocr.words > 0, `${ocr.words} words`);

// --- export ----------------------------------------------------------------
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Export PDF').click();
});
let file = null;
for (let i = 0; i < 60; i++) {
  const files = (await readdir(DOWNLOADS)).filter((f) => f.endsWith('.pdf'));
  if (files.length) { file = files[0]; break; }
  await new Promise((r) => setTimeout(r, 500));
}
check('PDF exported', !!file, file ?? 'no file appeared');

if (file) {
  const bytes = await readFile(join(DOWNLOADS, file));
  check('file is a real PDF', bytes.subarray(0, 5).toString() === '%PDF-');
  const pdf = await PDFDocument.load(bytes);
  check('PDF has one page', pdf.getPageCount() === 1, `${pdf.getPageCount()} page(s)`);
  // Extract text the way a reader would, rather than grepping raw bytes —
  // pdf-lib packs objects into compressed streams, so a regex sees nothing.
  const extracted = await extractText(bytes);
  const words = extracted.split(/\s+/).filter(Boolean);
  console.log(`  text recoverable from the PDF: ${words.length} words`);
  console.log(`  sample: ${JSON.stringify(extracted.slice(0, 90))}`);
  check('PDF text layer is searchable', /rental|agreement|tenant/i.test(extracted),
    `${words.length} words recovered`);
  console.log(`  exported ${file} (${(bytes.length / 1024).toFixed(0)} KB, ${pdf.getPageCount()} page)`);
}

await page.screenshot({ path: join(OUT, 'flow-4-exported.png') });
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
