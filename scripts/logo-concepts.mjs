/**
 * Renders logo candidates to PNG tiles so they can be compared side by side
 * at real icon sizes before one is committed to.
 */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = resolve('./shots/logos');
await mkdir(OUT, { recursive: true });

/** A: page held in a viewfinder, mid-scan. */
const scanFrame = `
<rect width="128" height="128" rx="30" fill="url(#tile)"/>
<g transform="translate(64 64)">
  <g transform="translate(-26 -33)">
    <path d="M4 0 H36 L48 12 V64 A4 4 0 0 1 44 68 H4 A4 4 0 0 1 0 64 V4 A4 4 0 0 1 4 0 Z" fill="#fff"/>
    <path d="M36 0 L48 12 H38 A2 2 0 0 1 36 10 Z" fill="url(#fold)"/>
    <g fill="#8e97b5">
      <rect x="9" y="24" width="30" height="3.4" rx="1.7"/>
      <rect x="9" y="33" width="22" height="3.4" rx="1.7"/>
      <rect x="9" y="42" width="30" height="3.4" rx="1.7"/>
      <rect x="9" y="51" width="17" height="3.4" rx="1.7"/>
    </g>
    <rect x="-7" y="30" width="62" height="5" rx="2.5" fill="url(#beamA)"/>
  </g>
  <g stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".95">
    <path d="M-42 -30 V-40 A4 4 0 0 1 -38 -44 H-28"/>
    <path d="M42 -30 V-40 A4 4 0 0 0 38 -44 H28"/>
    <path d="M-42 30 V40 A4 4 0 0 0 -38 44 H-28"/>
    <path d="M42 30 V40 A4 4 0 0 0 38 44 H28"/>
  </g>
</g>`;

/** B: a flatbed scanner with its lamp lit. */
const flatbed = `
<rect width="128" height="128" rx="30" fill="url(#tile)"/>
<g transform="translate(64 68)">
  <rect x="-40" y="-4" width="80" height="30" rx="8" fill="#fff"/>
  <rect x="-40" y="12" width="80" height="14" rx="7" fill="#c9d0e4"/>
  <circle cx="28" cy="19" r="3" fill="url(#fold)"/>
  <g transform="rotate(-8)">
    <rect x="-34" y="-30" width="68" height="26" rx="5" fill="#eef1f9"/>
    <g fill="#9aa3c0">
      <rect x="-24" y="-23" width="34" height="3" rx="1.5"/>
      <rect x="-24" y="-16" width="26" height="3" rx="1.5"/>
    </g>
  </g>
  <rect x="-34" y="-6" width="68" height="6" rx="3" fill="url(#beamB)"/>
</g>`;

/** C: an 'a' cut from a page, with the scan light passing through. */
const monogram = `
<rect width="128" height="128" rx="30" fill="url(#tile)"/>
<g transform="translate(64 64)">
  <path d="M-30 -40 H14 L30 -24 V40 A5 5 0 0 1 25 45 H-30 A5 5 0 0 1 -35 40 V-35 A5 5 0 0 1 -30 -40 Z" fill="#fff"/>
  <path d="M14 -40 L30 -24 H17 A3 3 0 0 1 14 -27 Z" fill="url(#fold)"/>
  <text x="-3" y="26" font-family="Georgia, 'Times New Roman', serif" font-size="62"
        font-weight="700" fill="#1b2036" text-anchor="middle">a</text>
  <rect x="-42" y="-4" width="84" height="7" rx="3.5" fill="url(#beamA)"/>
</g>`;

const DEFS = `
<defs>
  <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="ACCENT1"/><stop offset="100%" stop-color="ACCENT2"/>
  </linearGradient>
  <linearGradient id="fold" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#c3cbe4"/><stop offset="100%" stop-color="#9aa4c4"/>
  </linearGradient>
  <linearGradient id="beamA" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="ACCENT2" stop-opacity="0"/>
    <stop offset="50%" stop-color="ACCENT2"/>
    <stop offset="100%" stop-color="ACCENT2" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="beamB" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="ACCENT2" stop-opacity="0"/>
    <stop offset="50%" stop-color="ACCENT2"/>
    <stop offset="100%" stop-color="ACCENT2" stop-opacity="0"/>
  </linearGradient>
</defs>`;

const CONCEPTS = { 'a-scanframe': scanFrame, 'b-flatbed': flatbed, 'c-monogram': monogram };
// Accents from the porcelain palette, which is the liveliest of the three.
const A1 = '#6257f5';
const A2 = '#ef5da8';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--disable-background-networking', '--disable-component-update'],
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 340, deviceScaleFactor: 2 });

for (const [name, body] of Object.entries(CONCEPTS)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${DEFS}${body}</svg>`
    .replaceAll('ACCENT1', A1).replaceAll('ACCENT2', A2);
  await writeFile(resolve(OUT, `${name}.svg`), svg);

  // Show it at icon sizes on both grounds, which is where a mark actually lives.
  await page.setContent(`<body style="margin:0;display:flex;align-items:center;gap:40px;
      font:600 13px system-ui;background:#12141c;color:#8b93a7;padding:40px">
    <div style="text-align:center"><div style="width:180px">${svg}</div><div style="margin-top:12px">180px</div></div>
    <div style="text-align:center"><div style="width:96px">${svg}</div><div style="margin-top:12px">96px</div></div>
    <div style="text-align:center"><div style="width:48px">${svg}</div><div style="margin-top:12px">48px</div></div>
    <div style="background:#eef0f8;padding:20px;border-radius:16px;text-align:center">
      <div style="width:96px">${svg}</div><div style="margin-top:12px;color:#6b7391">on light</div></div>
  </body>`);
  await page.screenshot({ path: resolve(OUT, `${name}.png`) });
  console.log(`rendered ${name}`);
}
await browser.close();
