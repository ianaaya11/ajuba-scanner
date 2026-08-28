/**
 * The ajuba scanner mark, in one place: the portrait being scanned, held in
 * viewfinder brackets with the beam crossing it. Everything that needs the
 * logo renders from here — favicon, PWA icons, Android launcher icons.
 *
 * The photo is inlined as a data URI so the favicon stays a single file with
 * no second request.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BRAND = { accent: '#6257f5', accent2: '#ef5da8' };

const here = dirname(fileURLToPath(import.meta.url));
/**
 * A contour of the portrait rather than the photograph itself: line art holds
 * up when the mark is shrunk to 32px, where a photo turns to mush. Generated
 * by scripts/make-contour.mjs.
 */
const CONTOUR = `data:image/png;base64,${readFileSync(join(here, '..', 'brand', 'contour.png')).toString('base64')}`;

/**
 * @param {object} o
 * @param {boolean} [o.tile]     draw the rounded gradient tile behind the mark
 * @param {number}  [o.inset]    shrink the mark, for maskable icons' safe zone
 * @param {boolean} [o.flat]     solid accent instead of a gradient (tiny sizes)
 */
export function logoSvg({ tile = true, inset = 0, flat = false } = {}) {
  const scale = 1 - inset;
  const fill = flat ? BRAND.accent : 'url(#tile)';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BRAND.accent}"/>
      <stop offset="100%" stop-color="${BRAND.accent2}"/>
    </linearGradient>
    <linearGradient id="fold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#c3cbe4"/><stop offset="100%" stop-color="#9aa4c4"/>
    </linearGradient>
    <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${BRAND.accent2}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${BRAND.accent2}"/>
      <stop offset="100%" stop-color="${BRAND.accent2}" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="photo">
      <rect x="4" y="4" width="40" height="60" rx="3"/>
    </clipPath>
  </defs>
  ${tile ? `<rect width="128" height="128" rx="30" fill="${fill}"/>` : ''}
  <g transform="translate(64 64) scale(${scale})">
    <g transform="translate(-26 -33)">
      <path d="M4 0 H36 L48 12 V64 A4 4 0 0 1 44 68 H4 A4 4 0 0 1 0 64 V4 A4 4 0 0 1 4 0 Z" fill="#fff"/>
      <image href="${CONTOUR}" x="5" y="4" width="38" height="45"
             preserveAspectRatio="xMidYMid meet" clip-path="url(#photo)"/>
      <g fill="#aeb6cc">
        <rect x="11" y="54" width="26" height="3" rx="1.5"/>
        <rect x="11" y="60" width="17" height="3" rx="1.5"/>
      </g>
      <path d="M36 0 L48 12 H38 A2 2 0 0 1 36 10 Z" fill="url(#fold)"/>
      <rect x="-7" y="44" width="62" height="5" rx="2.5" fill="url(#beam)" opacity=".95"/>
    </g>
    <g stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M-42 -30 V-40 A4 4 0 0 1 -38 -44 H-28"/>
      <path d="M42 -30 V-40 A4 4 0 0 0 38 -44 H28"/>
      <path d="M-42 30 V40 A4 4 0 0 0 -38 44 H-28"/>
      <path d="M42 30 V40 A4 4 0 0 1 38 44 H28"/>
    </g>
  </g>
</svg>`;
}
