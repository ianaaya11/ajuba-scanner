/**
 * Rasterises the mark from scripts/logo.mjs to every size the web manifest and
 * the Android launcher need. One SVG source, so the icon can never drift
 * between platforms.
 */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logoSvg } from './logo.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  ['public/icons/icon-192.png', 192, {}],
  ['public/icons/icon-512.png', 512, {}],
  // Maskable icons are cropped to a circle on some launchers; keep the mark
  // inside the safe zone so the brackets are never clipped.
  ['public/icons/maskable-512.png', 512, { inset: 0.22 }],
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
  // Adaptive foreground: no tile, and inset for the launcher's own safe zone.
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png', 108, { tile: false, inset: 0.34 }],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png', 162, { tile: false, inset: 0.34 }],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png', 216, { tile: false, inset: 0.34 }],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png', 324, { tile: false, inset: 0.34 }],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png', 432, { tile: false, inset: 0.34 }],
];

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--disable-background-networking', '--disable-component-update'],
});
const page = await browser.newPage();

for (const [path, size, options] of targets) {
  const svg = logoSvg(options);
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(
    `<body style="margin:0">
       <div style="width:${size}px;height:${size}px">
         ${svg.replace('width="128" height="128"', 'width="100%" height="100%"')}
       </div>
     </body>`,
  );
  const full = join(root, path);
  await mkdir(dirname(full), { recursive: true });
  await page.screenshot({ path: full, omitBackground: true });
  console.log(`wrote ${path} (${size}px)`);
}

// The favicon is the mark itself, scalable.
await writeFile(join(root, 'public/favicon.svg'), logoSvg());
console.log('wrote public/favicon.svg');

await browser.close();
