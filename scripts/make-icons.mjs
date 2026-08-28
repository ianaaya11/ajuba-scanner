/**
 * Rasterises the marks from scripts/logo.mjs to every size the platforms need.
 *
 * The web build uses the page mark with the contour portrait; the Android
 * launcher and the Play Store listing use the badge mark with the embossed
 * one, where the icon is seen large and on its own.
 */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logoSvg } from './logo.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const web = { mark: 'page' };
const app = { mark: 'badge' };

const targets = [
  // Web: favicon and PWA icons.
  ['public/icons/icon-192.png', 192, web],
  ['public/icons/icon-512.png', 512, web],
  // Maskable icons are cropped to a circle on some launchers; keep the mark
  // inside the safe zone so the brackets are never clipped.
  ['public/icons/maskable-512.png', 512, { ...web, inset: 0.22 }],

  // Android launcher, per density.
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher.png', 48, app],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher.png', 72, app],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher.png', 96, app],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png', 144, app],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 192, app],
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png', 48, app],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png', 72, app],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png', 96, app],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png', 144, app],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png', 192, app],
  // Adaptive foreground: no tile, and inset for the launcher's own safe zone.
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png', 108, { ...app, tile: false, inset: 0.34 }],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png', 162, { ...app, tile: false, inset: 0.34 }],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png', 216, { ...app, tile: false, inset: 0.34 }],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png', 324, { ...app, tile: false, inset: 0.34 }],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png', 432, { ...app, tile: false, inset: 0.34 }],

  // Play Store listing: 512 square, full bleed and opaque. Google applies its
  // own rounding, so a pre-rounded icon shows corner artefacts.
  ['brand/play-store-icon.png', 512, { ...app, radius: 0, opaque: true }],
];

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--disable-background-networking', '--disable-component-update'],
});
const page = await browser.newPage();

for (const [path, size, options] of targets) {
  const { opaque = false, ...svgOptions } = options;
  const svg = logoSvg(svgOptions);
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
  await page.screenshot({ path: full, omitBackground: !opaque });
  console.log(`wrote ${path} (${size}px)`);
}

// The favicon is the web mark itself, scalable.
await writeFile(join(root, 'public/favicon.svg'), logoSvg(web));
console.log('wrote public/favicon.svg');

await browser.close();
