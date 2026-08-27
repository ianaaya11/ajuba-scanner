/**
 * The ajuba scanner mark, in one place: a page held in viewfinder brackets
 * with the scan beam crossing it. Everything that needs the logo renders from
 * here — favicon, PWA icons, Android launcher icons.
 */

export const BRAND = { accent: '#6257f5', accent2: '#ef5da8' };

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
  </defs>
  ${tile ? `<rect width="128" height="128" rx="30" fill="${fill}"/>` : ''}
  <g transform="translate(64 64) scale(${scale})">
    <g transform="translate(-26 -33)">
      <path d="M4 0 H36 L48 12 V64 A4 4 0 0 1 44 68 H4 A4 4 0 0 1 0 64 V4 A4 4 0 0 1 4 0 Z" fill="#fff"/>
      <path d="M36 0 L48 12 H38 A2 2 0 0 1 36 10 Z" fill="url(#fold)"/>
      <g fill="#8e97b5">
        <rect x="9" y="24" width="30" height="3.4" rx="1.7"/>
        <rect x="9" y="33" width="22" height="3.4" rx="1.7"/>
        <rect x="9" y="42" width="30" height="3.4" rx="1.7"/>
        <rect x="9" y="51" width="17" height="3.4" rx="1.7"/>
      </g>
      <rect x="-7" y="30" width="62" height="5" rx="2.5" fill="url(#beam)"/>
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
