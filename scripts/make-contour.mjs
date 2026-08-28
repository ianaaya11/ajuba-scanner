/**
 * Turns the source portrait into line art for the mark. Runs the same kind of
 * pipeline the scanner itself uses — greyscale, blur, Sobel, threshold — but
 * tuned for a portrait rather than a page of text.
 *
 * Outputs several treatments so they can be compared before one is chosen.
 */
import puppeteer from 'puppeteer-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SRC = resolve(process.argv[2] ?? './brand/ajuba.jpg');
const OUT = resolve('./brand');
await mkdir(OUT, { recursive: true });
await mkdir(resolve('./shots/logos'), { recursive: true });

const dataUrl = `data:image/jpeg;base64,${(await readFile(SRC)).toString('base64')}`;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--disable-background-networking', '--disable-component-update'],
});
const page = await browser.newPage();

const results = await page.evaluate(async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();

  // Crop to head and shoulders: the patterned cloth lower down turns to noise
  // once the mark is shrunk to icon size.
  const CROP = { x: 0.05, y: 0.02, w: 0.90, h: 0.735 };
  const sx = img.width * CROP.x;
  const sy = img.height * CROP.y;
  const sw = img.width * CROP.w;
  const sh = img.height * CROP.h;

  const W = 240;
  const H = Math.round((sh / sw) * W);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
  const src0 = ctx.getImageData(0, 0, W, H).data;

  const gray = new Float32Array(W * H);
  for (let i = 0, p = 0; i < src0.length; i += 4, p++) {
    gray[p] = 0.299 * src0[i] + 0.587 * src0[i + 1] + 0.114 * src0[i + 2];
  }

  const integral = (a) => {
    const s = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) {
        row += a[y * W + x];
        s[(y + 1) * (W + 1) + (x + 1)] = s[y * (W + 1) + (x + 1)] + row;
      }
    }
    return s;
  };
  const blur = (a, r) => {
    const s = integral(a);
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
        const sum = s[y1 * (W + 1) + x1] - s[y0 * (W + 1) + x1] - s[y1 * (W + 1) + x0] + s[y0 * (W + 1) + x0];
        out[y * W + x] = sum / ((x1 - x0) * (y1 - y0));
      }
    }
    return out;
  };
  const sobel = (a) => {
    const out = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const gx = a[i - W + 1] + 2 * a[i + 1] + a[i + W + 1] - a[i - W - 1] - 2 * a[i - 1] - a[i + W - 1];
        const gy = a[i + W - 1] + 2 * a[i + W] + a[i + W + 1] - a[i - W - 1] - 2 * a[i - W] - a[i - W + 1];
        out[i] = Math.hypot(gx, gy);
      }
    }
    return out;
  };
  /** Thickens ink so the contour survives being shrunk to an icon. */
  const dilate = (a, r) => {
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let m = 0;
        for (let dy = -r; dy <= r; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -r; dx <= r; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= W) continue;
            const v = a[yy * W + xx];
            if (v > m) m = v;
          }
        }
        out[y * W + x] = m;
      }
    }
    return out;
  };

  const percentile = (a, p) => {
    const sorted = Float32Array.from(a).sort();
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  };

  /** Ink on transparent, so the mark can be tinted to any colour later. */
  const toPng = (alpha) => {
    const o = document.createElement('canvas');
    o.width = W; o.height = H;
    const octx = o.getContext('2d');
    const id = octx.createImageData(W, H);
    for (let p = 0, i = 0; p < W * H; p++, i += 4) {
      id.data[i] = id.data[i + 1] = id.data[i + 2] = 0;
      id.data[i + 3] = Math.max(0, Math.min(255, alpha[p]));
    }
    octx.putImageData(id, 0, 0);
    return o.toDataURL('image/png');
  };

  const out = {};

  /** Edge strength as ink density, which keeps the eyes instead of dropping
      them at a hard threshold. `weight` thickens the result. */
  const contour = (loPct, hiPct, weight) => {
    const e = sobel(blur(gray, 2));
    const lo = percentile(e, loPct);
    const hi = percentile(e, hiPct);
    let a = new Float32Array(W * H);
    for (let i = 0; i < a.length; i++) {
      a[i] = Math.max(0, Math.min(1, (e[i] - lo) / Math.max(1, hi - lo))) * 255;
    }
    if (weight) a = dilate(a, weight);
    return toPng(a);
  };

  // One canonical weight: fine lines vanish at icon size, heavy ones clog.
  out.contour = contour(0.70, 0.97, 1);

  return out;
}, dataUrl);

for (const [name, url] of Object.entries(results)) {
  await writeFile(resolve(OUT, `contour-${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  console.log(`wrote brand/contour-${name}.png`);
}

// Comparison sheet: ink on the brand gradient, at large and icon sizes.
const tiles = Object.entries(results).map(([name, url]) => `
  <div style="text-align:center">
    <div style="width:190px;height:190px;border-radius:34px;display:grid;place-items:center;
                background:linear-gradient(135deg,#6257f5,#ef5da8)">
      <img src="${url}" style="height:150px;filter:invert(1)">
    </div>
    <div style="width:60px;height:60px;border-radius:13px;margin:12px auto 0;display:grid;place-items:center;
                background:linear-gradient(135deg,#6257f5,#ef5da8)">
      <img src="${url}" style="height:47px;filter:invert(1)">
    </div>
    <div style="margin-top:10px;font:600 13px system-ui;color:#8b93a7">${name}</div>
  </div>`).join('');
await page.setViewport({ width: 900, height: 380, deviceScaleFactor: 2 });
await page.setContent(`<body style="margin:0;display:flex;gap:34px;justify-content:center;
  align-items:center;background:#12141c;padding:30px">${tiles}</body>`);
await page.screenshot({ path: './shots/logos/contours.png' });

await browser.close();
