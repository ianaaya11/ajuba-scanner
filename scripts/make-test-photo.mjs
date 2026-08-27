/**
 * Renders a synthetic "photo of a page on a desk": real typeset text, seen at
 * an angle, unevenly lit, on a noisy dark surface. Drives edge detection, the
 * perspective warp, the filters and OCR without needing a camera.
 *
 * Uses a real browser purely for its text rasteriser — the perspective and
 * lighting are computed here, the same way src/lib/warp.ts does it.
 */
import puppeteer from 'puppeteer-core';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = resolve(process.argv[2] ?? './shots/test-photo.png');

/** Where the page corners land in the scene, in TL,TR,BR,BL order. */
export const TRUTH = [
  [205, 250],
  [1035, 155],
  [1090, 1425],
  [135, 1330],
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-first-run', '--disable-background-networking', '--disable-component-update'],
});
const page = await browser.newPage();

const dataUrl = await page.evaluate((TRUTH) => {
  const W = 1200;
  const H = 1600;
  const PW = 850;
  const PH = 1100;

  // --- the flat page ---
  const flat = document.createElement('canvas');
  flat.width = PW;
  flat.height = PH;
  const f = flat.getContext('2d');
  f.fillStyle = '#ffffff';
  f.fillRect(0, 0, PW, PH);
  f.fillStyle = '#000000';

  f.font = 'bold 46px Georgia, serif';
  f.fillText('Rental Agreement', 70, 130);

  f.font = '25px Georgia, serif';
  const body = [
    'This agreement is made between the landlord and the',
    'tenant for the property described below. The tenant',
    'agrees to pay rent monthly on the first day of each',
    'month. The deposit is held for the duration of the',
    'tenancy and returned within thirty days of the end',
    'of the term, less any deductions for damage beyond',
    'ordinary wear and tear.',
    '',
    'The landlord shall maintain the structure, the roof,',
    'the plumbing and the electrical systems in working',
    'order. The tenant shall notify the landlord promptly',
    'of any defect requiring repair. Neither party may',
    'assign this agreement without written consent.',
    '',
    'Quiet enjoyment of the property is guaranteed to the',
    'tenant for the whole of the term. Access for repairs',
    'requires twenty four hours notice except in an',
    'emergency affecting safety or the fabric of the',
    'building.',
  ];
  body.forEach((line, i) => f.fillText(line, 70, 215 + i * 44));

  const pageData = f.getImageData(0, 0, PW, PH).data;

  // --- homography: scene -> page ---
  const solve = (A, b) => {
    const n = b.length;
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
      }
      [A[col], A[pivot]] = [A[pivot], A[col]];
      [b[col], b[pivot]] = [b[pivot], b[col]];
      const d = A[col][col];
      for (let row = col + 1; row < n; row++) {
        const k0 = A[row][col] / d;
        for (let k = col; k < n; k++) A[row][k] -= k0 * A[col][k];
        b[row] -= k0 * b[col];
      }
    }
    const x = new Array(n).fill(0);
    for (let row = n - 1; row >= 0; row--) {
      let sum = b[row];
      for (let k = row + 1; k < n; k++) sum -= A[row][k] * x[k];
      x[row] = sum / A[row][row];
    }
    return x;
  };
  const homography = (from, to) => {
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = from[i];
      const [u, v] = to[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    return [...solve(A, b), 1];
  };
  const h = homography(TRUTH, [[0, 0], [PW - 1, 0], [PW - 1, PH - 1], [0, PH - 1]]);

  // --- project into the scene ---
  const scene = document.createElement('canvas');
  scene.width = W;
  scene.height = H;
  const s = scene.getContext('2d');
  const img = s.createImageData(W, H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const w = h[6] * x + h[7] * y + h[8];
      const px = (h[0] * x + h[1] * y + h[2]) / w;
      const py = (h[3] * x + h[4] * y + h[5]) / w;
      const i = (y * W + x) * 4;

      if (px >= 0 && px < PW - 1 && py >= 0 && py < PH - 1) {
        // Bilinear sample so glyph edges stay smooth after projection.
        const x0 = Math.floor(px), y0 = Math.floor(py);
        const fx = px - x0, fy = py - y0;
        const at = (xx, yy) => pageData[(yy * PW + xx) * 4];
        const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
        const bot = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
        const v = top * (1 - fy) + bot * fy;
        // Uneven light falling off to the bottom-right: what Auto divides out.
        const light = 1.02 - 0.4 * ((x / W) * 0.6 + (y / H) * 0.4);
        img.data[i] = Math.min(255, v * light);
        img.data[i + 1] = Math.min(255, v * light);
        img.data[i + 2] = Math.min(255, v * light * 0.985);
      } else {
        const n = ((x * 7919 + y * 104729) % 23) - 11;
        img.data[i] = 46 + n;
        img.data[i + 1] = 44 + n;
        img.data[i + 2] = 41 + n;
      }
      img.data[i + 3] = 255;
    }
  }
  s.putImageData(img, 0, 0);
  return scene.toDataURL('image/png');
}, TRUTH);

await browser.close();
await writeFile(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log(`wrote ${OUT} (1200x1600)`);
console.log('page corners:', TRUTH.map((p) => p.join(',')).join('  '));
