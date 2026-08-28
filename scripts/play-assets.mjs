/**
 * Play Store listing assets: feature graphic and phone screenshots.
 *
 * Sizes follow the Play Console's rules — the feature graphic is exactly
 * 1024x500 with no alpha, and screenshots are 1080x1920, which sits inside the
 * 2:1 aspect limit. The app's own 412-wide screenshots are 1:2.14 and would be
 * rejected.
 */
import puppeteer from 'puppeteer-core';
import { mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { logoSvg } from './logo.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE ?? 'http://127.0.0.1:4191';
const OUT = resolve('./brand/play-store');
await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--disable-background-networking', '--disable-component-update'],
});
const page = await browser.newPage();

// --- feature graphic -------------------------------------------------------
await page.setViewport({ width: 1024, height: 500, deviceScaleFactor: 1 });
await page.setContent(`<body style="margin:0;width:1024px;height:500px;overflow:hidden;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  background:
    radial-gradient(700px 460px at 12% -20%, rgba(123,116,255,.55), transparent 60%),
    radial-gradient(620px 420px at 104% 10%, rgba(255,111,177,.45), transparent 58%),
    linear-gradient(140deg,#12142a,#0a0c1a);
  display:flex;align-items:center;gap:52px;padding:0 68px;box-sizing:border-box">
  <div style="width:196px;height:196px;flex:none;filter:drop-shadow(0 24px 46px rgba(0,0,0,.55))">
    ${logoSvg({ mark: 'badge' })}
  </div>
  <div style="color:#edeffb">
    <div style="font-size:62px;font-weight:700;letter-spacing:-.03em;line-height:1">ajuba scanner</div>
    <div style="font-size:26px;color:#aab2d4;margin-top:18px;line-height:1.35;max-width:520px">
      Scan, sign and export PDFs.<br>Everything stays on your device.
    </div>
    <div style="display:flex;gap:10px;margin-top:26px">
      ${['Auto edge detection', 'Offline OCR', 'Signatures'].map((t) => `
        <span style="border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);
          border-radius:999px;padding:8px 16px;font-size:15px;font-weight:600;color:#dfe4f7">${t}</span>`).join('')}
    </div>
  </div>
</body>`);
await page.screenshot({ path: resolve(OUT, 'feature-graphic-1024x500.png'), omitBackground: false });
console.log('wrote feature-graphic-1024x500.png');

// --- screenshots -----------------------------------------------------------
await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 2 });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
await page.goto(BASE, { waitUntil: 'networkidle0' });

const ids = await page.evaluate(async () => {
  const draw = (title, lines) => {
    const c = document.createElement('canvas');
    c.width = 850; c.height = 1100;
    const x = c.getContext('2d');
    x.fillStyle = '#f8f6f0'; x.fillRect(0, 0, 850, 1100);
    x.fillStyle = '#16181d';
    x.font = 'bold 44px Georgia'; x.fillText(title, 70, 130);
    x.font = '24px Georgia';
    lines.forEach((t, i) => x.fillText(t, 70, 210 + i * 42));
    x.font = '24px Georgia';
    x.fillText('Signed:', 70, 900); x.fillText('Date:', 470, 900);
    return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
  };
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('ajuba-scanner', 1);
    r.onupgradeneeded = () => { const d = r.result;
      const s = d.createObjectStore('docs', { keyPath: 'id' });
      s.createIndex('updatedAt', 'updatedAt'); d.createObjectStore('blobs'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const put = (st, v, k) => new Promise((res) => { const t = db.transaction(st, 'readwrite');
    const q = k === undefined ? t.objectStore(st).put(v) : t.objectStore(st).put(v, k);
    q.onsuccess = () => res(); });

  const docs = [
    ['Rental agreement', 4, ['This agreement is made between the landlord', 'and the tenant for the property described', 'below. Rent is payable monthly in advance.', 'The deposit is returned within thirty days.']],
    ['Tax return 2025', 3, ['Statement of income for the year ending', 'April 2025. All figures in pounds sterling.']],
    ['Clinic receipt', 1, ['Consultation and dispensing charges.']],
  ];
  const made = [];
  let n = 0;
  for (const [name, count, lines] of docs) {
    const pages = [];
    for (let p = 0; p < count; p++) {
      const key = 'k' + (n++);
      await put('blobs', await draw(name, lines), key);
      pages.push({ id: 'p' + key, imageKey: key, width: 850, height: 1100,
        rotation: 0, filter: 'magic', annotations: [], ocrText: p === 0 ? 'recognised' : undefined });
    }
    // A signed and dated first page, to show what the editor produces.
    pages[0].annotations = [
      { kind: 'signature', color: '#12162a', box: { x: 0.235, y: 0.775, w: 0.26, h: 0.075 },
        aspect: 2.8, width: 0.05,
        strokes: [[{ x: 0, y: .58 }, { x: .14, y: .12 }, { x: .3, y: .82 }, { x: .46, y: .18 },
                   { x: .6, y: .7 }, { x: .78, y: .22 }, { x: 1, y: .52 }]] },
      { kind: 'text', color: '#2563eb', size: 0.022, at: { x: 0.665, y: 0.787 }, text: '28 August 2026' },
    ];
    const id = 'doc-' + n;
    made.push(id);
    await put('docs', { id, name, createdAt: Date.now() - n * 8.6e7, updatedAt: Date.now() - n * 3.6e6, pages });
  }
  return made;
});

const shots = [
  ['1-library', '/', 900],
  ['2-document', `/doc/${ids[0]}`, 1100],
  ['3-signed-page', `/doc/${ids[0]}/page/pk0`, 1300],
];
for (const [name, route, wait] of shots) {
  await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, wait));
  await page.screenshot({ path: resolve(OUT, `screenshot-${name}.png`) });
  console.log(`wrote screenshot-${name}.png`);
}

await copyFile(resolve('./brand/play-store-icon.png'), resolve(OUT, 'icon-512.png'));
console.log('wrote icon-512.png');
await browser.close();
