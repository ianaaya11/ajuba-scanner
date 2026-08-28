/**
 * The ajuba scanner marks, in one place. Everything that needs a logo renders
 * from here, so the platforms cannot drift apart.
 *
 * Two marks, on purpose:
 *
 *   page   the contour portrait on a document page, in viewfinder brackets.
 *          Used for the web build — favicon and PWA icons — and mirrored by
 *          the animated watermark in src/ui/Backdrop.tsx.
 *
 *   badge  the embossed portrait in a ring. Used for the Android launcher and
 *          the Play Store listing, where the icon is seen large and on its own
 *          and the relief reads as a struck seal.
 *
 * Artwork is inlined as a data URI so the favicon stays a single file with no
 * second request.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BRAND = { accent: '#6257f5', accent2: '#ef5da8' };

const here = dirname(fileURLToPath(import.meta.url));
const asset = (name) => readFileSync(join(here, '..', 'brand', name));

/**
 * A contour of the portrait: line art holds up when the mark is shrunk to
 * 32px, where a photograph turns to mush. From scripts/make-contour.mjs.
 */
const CONTOUR = `data:image/png;base64,${asset('contour.png').toString('base64')}`;

/** Bas-relief of the same portrait. From scripts/make-portrait.mjs. */
const EMBOSS = `data:image/jpeg;base64,${asset('portrait-badge-emboss.jpg').toString('base64')}`;

const GRADIENTS = `
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
    </linearGradient>`;

const PAGE_MARK = `
  <g transform="translate(-26 -33)">
    <path d="M4 0 H36 L48 12 V64 A4 4 0 0 1 44 68 H4 A4 4 0 0 1 0 64 V4 A4 4 0 0 1 4 0 Z" fill="#fff"/>
    <image href="${CONTOUR}" x="5" y="4" width="38" height="45"
           preserveAspectRatio="xMidYMid meet" clip-path="url(#pageClip)"/>
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
  </g>`;

const BADGE_MARK = `
  <circle cx="0" cy="-4" r="33" fill="#fff"/>
  <image href="${EMBOSS}" x="-33" y="-37" width="66" height="66"
         preserveAspectRatio="xMidYMid slice" clip-path="url(#badgeClip)"/>
  <rect x="-36" y="22" width="72" height="5" rx="2.5" fill="url(#beam)"
        clip-path="url(#badgeClip)" opacity=".95"/>
  <g stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M-44 -32 V-44 A4 4 0 0 1 -40 -48 H-30"/>
    <path d="M44 -32 V-44 A4 4 0 0 0 40 -48 H30"/>
    <path d="M-44 24 V36 A4 4 0 0 0 -40 40 H-30"/>
    <path d="M44 24 V36 A4 4 0 0 1 40 40 H30"/>
  </g>`;

/**
 * @param {object} o
 * @param {'page'|'badge'} [o.mark]  which mark to draw
 * @param {boolean} [o.tile]   draw the rounded gradient tile behind the mark
 * @param {number}  [o.inset]  shrink the mark, for maskable icons' safe zone
 * @param {number}  [o.radius] tile corner radius; 0 for a full-bleed square,
 *                             which is what the Play Store listing expects
 * @param {boolean} [o.flat]   solid accent instead of a gradient
 */
export function logoSvg({ mark = 'page', tile = true, inset = 0, radius = 30, flat = false } = {}) {
  const scale = 1 - inset;
  const fill = flat ? BRAND.accent : 'url(#tile)';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>${GRADIENTS}
    <clipPath id="pageClip"><rect x="4" y="4" width="40" height="60" rx="3"/></clipPath>
    <clipPath id="badgeClip"><circle cx="0" cy="-4" r="33"/></clipPath>
  </defs>
  ${tile ? `<rect width="128" height="128" rx="${radius}" fill="${fill}"/>` : ''}
  <g transform="translate(64 64) scale(${scale})">
    ${mark === 'badge' ? BADGE_MARK : PAGE_MARK}
  </g>
</svg>`;
}
