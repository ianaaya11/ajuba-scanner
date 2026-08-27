/**
 * Drives the real Chrome to screenshot each screen with seeded data, at both a
 * phone and a desktop viewport. Also reports horizontal overflow per screen.
 */
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE ?? 'http://127.0.0.1:4191';
const OUT = process.env.OUT ?? './shots';

const SCHEME = process.env.SCHEME ?? 'light';
const suffix = `-${SCHEME}`;

const VIEWPORTS = {
  phone: { width: 412, height: 880, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { width: 1600, height: 1000, deviceScaleFactor: 1 },
};

/** Paints a fake scanned page so the grid and editors have something to show. */
const SEED = `
  const draw = (label) => {
    const c = document.createElement('canvas');
    c.width = 850; c.height = 1100;
    const x = c.getContext('2d');
    x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#1a1a1a';
    x.font = 'bold 44px Georgia'; x.fillText(label, 70, 130);
    x.font = '22px Georgia';
    for (let i = 0; i < 22; i++) {
      const w = 620 - (i % 4) * 90;
      x.fillRect(70, 200 + i * 34, w, 3);
    }
    return new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
  };

  const db = await new Promise((res, rej) => {
    const rq = indexedDB.open('ajuba-scanner', 1);
    rq.onupgradeneeded = () => {
      const d = rq.result;
      const s = d.createObjectStore('docs', { keyPath: 'id' });
      s.createIndex('updatedAt', 'updatedAt');
      d.createObjectStore('blobs');
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });

  const put = (store, value, key) => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const rq = key === undefined ? tx.objectStore(store).put(value) : tx.objectStore(store).put(value, key);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });

  const docs = [
    ['Lease agreement', 4],
    ['Tax return 2025', 3],
    ['Clinic receipt', 1],
  ];
  let n = 0;
  const ids = [];
  for (const [name, count] of docs) {
    const pages = [];
    for (let p = 0; p < count; p++) {
      const key = 'blob-' + (n++);
      await put('blobs', await draw(name + ' - p' + (p + 1)), key);
      pages.push({
        id: 'page-' + key, imageKey: key, width: 850, height: 1100,
        rotation: p === 1 ? 90 : 0, filter: 'magic',
        annotations: p === 0 ? [
          { kind: 'highlight', color: '#fde047', width: 0.016,
            points: [{x:0.08,y:0.19},{x:0.5,y:0.19},{x:0.72,y:0.192}] },
          { kind: 'draw', color: '#dc2626', width: 0.004,
            points: [{x:0.12,y:0.42},{x:0.3,y:0.40},{x:0.45,y:0.45},{x:0.6,y:0.41}] },
          { kind: 'text', color: '#2563eb', size: 0.028, at: {x:0.1,y:0.62}, text: 'Check this clause' },
        ] : [],
        ocrText: p === 0 ? 'Recognised sample text for ' + name : undefined,
      });
    }
    const id = 'doc-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    ids.push(id);
    await put('docs', { id, name, createdAt: Date.now() - n * 86400000, updatedAt: Date.now() - n * 3600000, pages });
  }
  return ids;
`;

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-first-run', '--disable-background-networking', '--disable-component-update', '--disable-sync',
    // A synthetic webcam so the live camera screen can be exercised headlessly.
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  ],
});

const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: SCHEME }]);
page.on('pageerror', (e) => console.log('  PAGE ERROR:', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('  CONSOLE ERROR:', m.text()));

await page.setViewport(VIEWPORTS.desktop);
await page.goto(BASE, { waitUntil: 'networkidle0' });
const ids = await page.evaluate(`(async () => { ${SEED} })()`);
console.log('seeded', ids.length, 'documents');

const screens = [
  ['library', '/'],
  ['document', `/doc/${ids[0]}`],
  ['page-editor', `/doc/${ids[0]}/page/page-blob-0`],
  ['page-rotated', `/doc/${ids[0]}/page/page-blob-1`],
  ['camera', `/doc/${ids[0]}/scan`],
];

for (const [name, route] of screens) {
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    await page.setViewport(vp);
    await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle0' });

    await new Promise((r) => setTimeout(r, name === 'camera' ? 2500 : 900));
    if (name === 'camera') {
      const cam = await page.evaluate(() => {
        const v = document.querySelector('video');
        const g = document.querySelector('.camera-guide');
        if (!v) return null;
        const vb = v.getBoundingClientRect();
        const gb = g?.getBoundingClientRect();
        return {
          w: v.videoWidth, h: v.videoHeight, playing: !v.paused && v.readyState >= 2,
          // Guides must sit inside the picture, never over the letterbox bars.
          guideInside: gb ? gb.left >= vb.left - 1 && gb.right <= vb.right + 1 &&
                            gb.top >= vb.top - 1 && gb.bottom <= vb.bottom + 1 : false,
        };
      });
      console.log(`         camera ${cam ? `${cam.w}x${cam.h} playing=${cam.playing} guides-on-picture=${cam.guideInside}` : 'NO VIDEO'}`);
    }
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      stillLoading: document.body.innerText.includes('Loading'),
    }));
    const overflow = metrics.scrollWidth - metrics.clientWidth;
    console.log(
      `${vpName.padEnd(8)} ${name.padEnd(12)} overflow=${overflow}px${overflow > 0 ? '  <-- OVERFLOWS' : ''}${metrics.stillLoading ? '  <-- STUCK LOADING' : ''}`,
    );
    await page.screenshot({ path: `${OUT}/${name}-${vpName}${suffix}.png` });

    // The scan and page views must letterbox the page inside the stage; if the
    // image is taller than its container it is being cropped instead.
    const fit = await page.evaluate(() => {
      const stage = document.querySelector('.stage');
      const img = document.querySelector('.stage img, .stage canvas');
      if (!stage || !img) return null;
      const s = stage.getBoundingClientRect();
      const i = img.getBoundingClientRect();
      return {
        stage: [Math.round(s.width), Math.round(s.height)],
        image: [Math.round(i.width), Math.round(i.height)],
        cropped: i.height > s.height + 1 || i.width > s.width + 1,
      };
    });
    if (fit) {
      console.log(
        `         stage=${fit.stage.join('x')} image=${fit.image.join('x')}${fit.cropped ? '  <-- IMAGE CROPPED' : '  fits'}`,
      );
    }
  }
}

await browser.close();
console.log('done');
