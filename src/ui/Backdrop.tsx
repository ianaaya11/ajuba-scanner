/**
 * The Recto mark, sitting behind the library as a watermark. The scan beam
 * sweeps down the page, which is the one bit of motion that actually says
 * something about what the app does.
 *
 * Purely decorative: hidden from assistive tech, and it never takes pointer
 * events away from the list sitting on top of it.
 */
export default function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <svg viewBox="0 0 100 132" className="backdrop-mark">
        <defs>
          {/* Soft falloff so the beam reads as light rather than a drawn bar. */}
          <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
            <stop offset="45%" stopColor="var(--accent)" stopOpacity=".9" />
            <stop offset="55%" stopColor="var(--accent)" stopOpacity=".9" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
          <clipPath id="page-clip">
            <path d="M23 8 H64 L84 28 V120 A5 5 0 0 1 79 125 H23 A5 5 0 0 1 18 120 V13 A5 5 0 0 1 23 8 Z" />
          </clipPath>
        </defs>

        <g className="backdrop-page">
          <path
            className="sheet"
            d="M23 8 H64 L84 28 V120 A5 5 0 0 1 79 125 H23 A5 5 0 0 1 18 120 V13 A5 5 0 0 1 23 8 Z"
          />
          <path className="fold" d="M64 8 L84 28 H64 Z" />

          <g className="lines">
            <rect x="29" y="46" width="42" height="3.4" rx="1.7" />
            <rect x="29" y="57" width="36" height="3.4" rx="1.7" />
            <rect x="29" y="68" width="42" height="3.4" rx="1.7" />
            <rect x="29" y="79" width="30" height="3.4" rx="1.7" />
            <rect x="29" y="90" width="40" height="3.4" rx="1.7" />
            <rect x="29" y="101" width="24" height="3.4" rx="1.7" />
          </g>

          {/* Clipped to the sheet so the light only falls on the page. */}
          <g clipPath="url(#page-clip)">
            <rect className="beam" x="10" y="-14" width="80" height="26" fill="url(#beam)" />
          </g>
        </g>
      </svg>
    </div>
  );
}
