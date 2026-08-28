/**
 * Embossed greyscale portrait for the Android launcher and Play Store icon.
 *
 * Uses the same Rec. 601 luma the scanner's own greyscale filter uses, then a
 * gentle contrast lift — a straight desaturation of a warm studio portrait
 * comes out flat and muddy at small sizes.
 */
import puppeteer from 'puppeteer-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SRC = resolve(process.argv[2] ?? '/Users/mizzina/Desktop/ajuba.jpeg');
await mkdir(resolve('./brand'), { recursive: true });
await mkdir(resolve('./public/brand'), { recursive: true });

/**
 * Assets the app fetches at runtime. Nothing here: the emboss is inlined into
 * the launcher icons at build time, and the web watermark uses the contour.
 */
const SERVED = [];

const dataUrl = `data:image/jpeg;base64,${(await readFile(SRC)).toString('base64')}`;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--disable-background-networking', '--disable-component-update'],
});
const page = await browser.newPage();

/**
 * Two framings. The tall one matches the contour it replaces; the square one is
 * for the round badge, where a tight head-and-shoulders crop has its chin cut
 * off by the circular mask.
 */
const FRAMINGS = [
  // The embossed badge is used for the Android launcher and the Play Store
  // listing only. The web build keeps the contour mark — see scripts/logo.mjs.
  { name: 'portrait-badge-emboss', square: true, width: 420, style: 'emboss' },
];

const out = await page.evaluate(async (src, framings) => {
  const img = new Image();
  img.src = src;
  await img.decode();

  const results = {};
  for (const framing of framings) {
  // A square crop, centred on the head with room above the hair and below the
  // chin, so a circular mask has something to spare on every side.
  const CROP = framing.square
    ? (() => {
        // Full frame width, and tall enough to hold hair top to chin. Anything
        // narrower crops the jaw once the circular mask is applied.
        const side = img.width;
        return { x: 0, y: 0.09, w: 1, h: side / img.height };
      })()
    : framing.crop;

  const W = framing.width;
  const H = Math.round(((img.height * CROP.h) / (img.width * CROP.w)) * W);

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(
    img,
    img.width * CROP.x, img.height * CROP.y,
    img.width * CROP.w, img.height * CROP.h,
    0, 0, W, H,
  );

  const id = ctx.getImageData(0, 0, W, H);
  const d = id.data;

  // Luma, then a histogram stretch between the 2nd and 98th percentiles so the
  // portrait keeps its range instead of sitting in a narrow grey band.
  const luma = new Float32Array(W * H);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    luma[p] = v;
    hist[Math.round(v)]++;
  }
  const at = (frac) => {
    const target = luma.length * frac;
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += hist[v];
      if (seen >= target) return v;
    }
    return 255;
  };
  const lo = at(0.02);
  const hi = at(0.98);
  const span = Math.max(1, hi - lo);

  const stretched = new Float32Array(W * H);
  for (let p = 0; p < stretched.length; p++) {
    stretched[p] = Math.max(0, Math.min(255, ((luma[p] - lo) / span) * 255));
  }

  // Box blur via a summed-area table, used to settle photographic noise before
  // either treatment; posterising or embossing raw pixels amplifies it.
  const blur = (a, r) => {
    const sum = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) {
        row += a[y * W + x];
        sum[(y + 1) * (W + 1) + (x + 1)] = sum[y * (W + 1) + (x + 1)] + row;
      }
    }
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
        const s2 = sum[y1 * (W + 1) + x1] - sum[y0 * (W + 1) + x1]
                 - sum[y1 * (W + 1) + x0] + sum[y0 * (W + 1) + x0];
        out[y * W + x] = s2 / ((x1 - x0) * (y1 - y0));
      }
    }
    return out;
  };

  let final = stretched;

  if (framing.style === 'flat') {
    // Posterise to a handful of greys: no gradients, a printed-poster look.
    const smooth = blur(stretched, 3);
    const LEVELS = 5;
    final = new Float32Array(W * H);
    for (let p = 0; p < final.length; p++) {
      final[p] = Math.round((smooth[p] / 255) * (LEVELS - 1)) / (LEVELS - 1) * 255;
    }
  } else if (framing.style === 'emboss') {
    // Bas-relief: a zero-sum directional kernel biased to mid grey, so flat
    // areas land on 128 and only edges lift or sink.
    const g = blur(stretched, 1);
    final = new Float32Array(W * H);
    const K = [-2, -1, 0, -1, 0, 1, 0, 1, 2];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        let acc = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            acc += g[(y + ky) * W + (x + kx)] * K[(ky + 1) * 3 + (kx + 1)];
          }
        }
        // 1.6 gives the relief some bite; without it the result is nearly flat.
        final[y * W + x] = 128 + acc * 1.6;
      }
    }
    for (let x = 0; x < W; x++) { final[x] = 128; final[(H - 1) * W + x] = 128; }
    for (let y = 0; y < H; y++) { final[y * W] = 128; final[y * W + W - 1] = 128; }
  }

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const v = Math.max(0, Math.min(255, final[p]));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(id, 0, 0);

  results[framing.name] = { url: c.toDataURL('image/jpeg', 0.86), w: W, h: H };
  }
  return results;
}, dataUrl, FRAMINGS);

for (const [name, r] of Object.entries(out)) {
  const bytes = Buffer.from(r.url.split(',')[1], 'base64');
  await writeFile(resolve(`./brand/${name}.jpg`), bytes);
  // Only the watermark asset is fetched at runtime; the icon is inlined into
  // the SVG at build time, so shipping the rest would be dead weight.
  if (SERVED.includes(name)) await writeFile(resolve(`./public/brand/${name}.jpg`), bytes);
  console.log(`wrote brand/${name}.jpg (${r.w}x${r.h}, ${(bytes.length / 1024).toFixed(0)} KB)`);
}

await browser.close();
