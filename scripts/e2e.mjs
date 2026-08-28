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

/**
 * Counts vector paths, which is how signature ink is written.
 *
 * Note pdf.js folds the paint operator into `constructPath`, so a bare
 * `OPS.stroke` never appears and counting it would always read zero.
 */
async function countVectorPaths(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const ops = await (await doc.getPage(1)).getOperatorList();
  const n = ops.fnArray.filter((fn) => fn === pdfjs.OPS.constructPath).length;
  await doc.destroy();
  return n;
}

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
  args: [
    '--no-first-run', '--disable-background-networking', '--disable-component-update', '--disable-sync',
    // Synthetic webcam so the live camera and its shutter can be driven headlessly.
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  ],
});

const page = await browser.newPage();
page.on('pageerror', (e) => { console.log('  PAGE ERROR:', e.message); failures++; });
await page.setViewport({ width: 1200, height: 950 });

const cdp = await page.createCDPSession();
await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS });

await page.goto(BASE, { waitUntil: 'networkidle0' });

const clickText = (label) =>
  page.evaluate((l) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === l);
    if (!btn) throw new Error(`no button labelled ${l}`);
    btn.click();
  }, label);

// --- the live camera -------------------------------------------------------
await clickText('New scan');
await page.waitForSelector('video', { timeout: 20000 });
await page.waitForFunction(() => {
  const v = document.querySelector('video');
  return v && v.videoWidth > 0 && !v.paused;
}, { timeout: 20000 });
const cam = await page.evaluate(() => {
  const v = document.querySelector('video');
  return { w: v.videoWidth, h: v.videoHeight };
});
check('live camera starts in the browser', cam.w > 0, `${cam.w}x${cam.h} stream`);

// The shutter must yield a photo and move on to corner adjustment.
await page.evaluate(() => document.querySelector('.btn.shutter').click());
await page.waitForSelector('.stage svg polygon', { timeout: 30000 });
check('shutter captures a frame and opens the crop step', true);

// Back out and use the known test photo, so detection can be scored.
await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.evaluate(() => new Promise((res) => {
  const rq = indexedDB.deleteDatabase('ajuba-scanner');
  rq.onsuccess = rq.onerror = rq.onblocked = () => res();
}));
await page.reload({ waitUntil: 'networkidle0' });

// --- capture the reference photo -------------------------------------------
await clickText('New scan');
await page.waitForSelector('video', { timeout: 20000 });
const [chooser] = await Promise.all([
  page.waitForFileChooser({ timeout: 15000 }),
  clickText('Import'),
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
await clickText('Crop');
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
await clickText('Done');
await page.waitForSelector('.page-grid', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: join(OUT, 'flow-3-document.png') });
check('scanned page saved into the document',
  (await page.$$('.page-card')).length === 1, `${(await page.$$('.page-card')).length} page(s)`);

// --- OCR -------------------------------------------------------------------
await clickText('OCR');
await page.waitForFunction(
  () => !document.querySelector('.overlay') && !!document.querySelector('.ocr-flag'),
  { timeout: 180000, polling: 1000 },
).catch(() => {});
const ocrRan = await page.$('.ocr-flag');
check('OCR completed and flagged the page', !!ocrRan);

const ocr = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('ajuba-scanner');
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

// --- sign and date ---------------------------------------------------------
await page.evaluate(() => document.querySelector('.page-card .shot').click());
await page.waitForSelector('.tool-bar', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 700));

const clickChip = (label) =>
  page.evaluate((l) => {
    const c = [...document.querySelectorAll('.chip')].find((x) => x.textContent.trim() === l);
    if (!c) throw new Error(`no chip ${l}`);
    c.click();
  }, label);

/** Drags a rectangle across the page, as a finger marking out an area would. */
async function dragBox(fromFrac, toFrac) {
  const box = await page.evaluate(() => {
    const c = document.querySelector('.stage canvas');
    const b = c.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  const at = (f) => ({ x: box.x + box.w * f.x, y: box.y + box.h * f.y });
  const a = at(fromFrac);
  const b = at(toFrac);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 });
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}

await clickChip('Sign');
await dragBox({ x: 0.12, y: 0.74 }, { x: 0.52, y: 0.86 });
await page.waitForSelector('.sign-pad', { timeout: 15000 });
check('marking an area opens the signature pad', true);

// Scribble something signature-shaped on the pad.
const pad = await page.evaluate(() => {
  const b = document.querySelector('.sign-pad').getBoundingClientRect();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
});
await page.mouse.move(pad.x + pad.w * 0.15, pad.y + pad.h * 0.6);
await page.mouse.down();
for (const [fx, fy] of [[0.3, 0.3], [0.42, 0.7], [0.55, 0.32], [0.7, 0.66], [0.85, 0.45]]) {
  await page.mouse.move(pad.x + pad.w * fx, pad.y + pad.h * fy, { steps: 4 });
}
await page.mouse.up();
await clickText('Place');
await page.waitForFunction(() => !document.querySelector('.sign-pad'), { timeout: 10000 });

await new Promise((r) => setTimeout(r, 900));
const sigState = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('ajuba-scanner');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const docs = await new Promise((res, rej) => {
    const t = db.transaction('docs').objectStore('docs').getAll();
    t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
  });
  const pg = docs.flatMap((d) => d.pages)[0];
  return {
    polylines: document.querySelectorAll('.stage svg polyline').length,
    kinds: (pg?.annotations ?? []).map((a) => a.kind),
    padOpen: !!document.querySelector('.sign-pad'),
  };
});
console.log(`  stored annotations: [${sigState.kinds.join(', ')}]  padOpen=${sigState.padOpen}`);
check('signature is drawn onto the page', sigState.polylines > 0, `${sigState.polylines} polylines`);

await clickChip('Date');
await page.evaluate(() => {
  const c = document.querySelector('.stage canvas').getBoundingClientRect();
  document.elementFromPoint(c.x + c.width * 0.62, c.y + c.height * 0.79);
});
const stageBox = await page.evaluate(() => {
  const b = document.querySelector('.stage canvas').getBoundingClientRect();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
});
await page.mouse.click(stageBox.x + stageBox.w * 0.62, stageBox.y + stageBox.h * 0.79);
await page.waitForSelector('.date-input', { timeout: 15000 });
const dateText = await page.evaluate(() => {
  const chip = document.querySelector('.format-list .chip');
  chip.click();
  return chip.textContent.trim();
});
await clickText('Place');
await page.waitForFunction(() => !document.querySelector('.date-input'), { timeout: 10000 });
check('date stamp placed', true, dateText);

await page.evaluate(() => history.back());
await page.waitForSelector('.page-grid', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 600));

// --- export ----------------------------------------------------------------
await clickText('Export PDF');
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
  // The date is drawn as real text, so it must come back out of the PDF.
  check('date stamp survives into the PDF', extracted.includes(dateText), dateText);

  // The scan itself is an image plus invisible text, so any stroke in the
  // content stream is signature ink and nothing else.
  const paths = await countVectorPaths(bytes);
  check('signature is written into the PDF as vectors', paths > 0, `${paths} vector paths`);
  console.log(`  exported ${file} (${(bytes.length / 1024).toFixed(0)} KB, ${pdf.getPageCount()} page)`);
}

await page.screenshot({ path: join(OUT, 'flow-4-exported.png') });
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
