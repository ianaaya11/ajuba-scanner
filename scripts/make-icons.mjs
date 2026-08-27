/**
 * Draws the app icon and writes it as PNG at every size the web manifest and
 * the Android launcher need. Doing it in code keeps the icon reproducible and
 * avoids committing binaries we cannot regenerate.
 */
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const INK = [232, 237, 245];
const ACCENT = [79, 140, 255];
const BG = [17, 24, 36];

/** Minimal RGBA PNG encoder — one IDAT, no interlacing. */
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, tail]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Renders the mark: a page with a folded corner, crossed by a scan line, drawn
 * with 3x supersampling so the edges stay smooth at small sizes.
 */
function draw(size, { transparent = false, inset = 0.16 } = {}) {
  const ss = 3;
  const n = size * ss;
  const acc = new Float32Array(size * size * 4);

  const pad = n * inset;
  const pageW = n - pad * 2;
  const pageH = pageW * 1.26;
  const top = (n - pageH) / 2;
  const fold = pageW * 0.3;
  const radius = n * 0.03;

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let color = transparent ? null : BG;
      let alpha = transparent ? 0 : 1;

      const px = x - pad;
      const py = y - top;
      const insidePage =
        px >= 0 && px <= pageW && py >= 0 && py <= pageH &&
        // Clip the folded top-right corner.
        !(px > pageW - fold && py < fold && px - (pageW - fold) > fold - py) &&
        // Round the other three corners.
        !(px < radius && py < radius && Math.hypot(radius - px, radius - py) > radius) &&
        !(px < radius && py > pageH - radius && Math.hypot(radius - px, py - (pageH - radius)) > radius) &&
        !(px > pageW - radius && py > pageH - radius &&
          Math.hypot(px - (pageW - radius), py - (pageH - radius)) > radius);

      if (insidePage) {
        color = INK;
        alpha = 1;
        // Text lines on the page.
        const lineTop = pageH * 0.42;
        const gap = pageH * 0.13;
        for (let i = 0; i < 3; i++) {
          const ly = lineTop + i * gap;
          const width = i === 2 ? pageW * 0.42 : pageW * 0.62;
          if (py > ly && py < ly + pageH * 0.045 && px > pageW * 0.19 && px < pageW * 0.19 + width) {
            color = BG;
          }
        }
        // The fold's shadow triangle.
        if (px > pageW - fold && py < fold && px - (pageW - fold) > fold - py - n * 0.012) {
          color = ACCENT;
        }
      }

      // The scan beam sweeping across the page.
      const beam = top + pageH * 0.3;
      if (py > beam - n * 0.018 && py < beam + n * 0.018 && x > pad - n * 0.05 && x < pad + pageW + n * 0.05) {
        color = ACCENT;
        alpha = 1;
      }

      const i = (Math.floor(y / ss) * size + Math.floor(x / ss)) * 4;
      if (color) {
        acc[i] += color[0];
        acc[i + 1] += color[1];
        acc[i + 2] += color[2];
      }
      acc[i + 3] += alpha * 255;
    }
  }

  const out = Buffer.alloc(size * size * 4);
  const samples = ss * ss;
  for (let i = 0; i < size * size * 4; i += 4) {
    for (let c = 0; c < 4; c++) out[i + c] = Math.round(acc[i + c] / samples);
  }
  return encodePng(size, size, out);
}

const targets = [
  // Web manifest
  ['public/icons/icon-192.png', 192, {}],
  ['public/icons/icon-512.png', 512, {}],
  ['public/icons/maskable-512.png', 512, { inset: 0.26 }],
  // Android launcher, per density
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher.png', 48, {}],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher.png', 72, {}],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher.png', 96, {}],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png', 144, {}],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 192, {}],
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png', 48, {}],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png', 72, {}],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png', 96, {}],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png', 144, {}],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png', 192, {}],
  // Adaptive-icon foreground: transparent, with the safe-zone inset.
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png', 108, { transparent: true, inset: 0.3 }],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png', 162, { transparent: true, inset: 0.3 }],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png', 216, { transparent: true, inset: 0.3 }],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png', 324, { transparent: true, inset: 0.3 }],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png', 432, { transparent: true, inset: 0.3 }],
];

for (const [path, size, options] of targets) {
  const full = join(root, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, draw(size, options));
  console.log(`wrote ${path} (${size}px)`);
}
