/**
 * The app mark sitting behind the library as a watermark: a page held in
 * viewfinder brackets, with the scan beam sweeping down it. The one bit of
 * motion here says what the app does rather than just decorating.
 *
 * Geometry mirrors scripts/logo.mjs, which is the source for the favicon and
 * the launcher icons — keep the two in step if the mark changes.
 *
 * Purely decorative: hidden from assistive tech, and it never takes pointer
 * events from the list on top of it.
 */
export default function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <svg viewBox="0 0 128 128" className="backdrop-mark">
        <defs>
          {/* Soft falloff so the beam reads as light, not a drawn bar. */}
          <linearGradient id="backdrop-beam" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent-2)" stopOpacity="0" />
            <stop offset="50%" stopColor="var(--accent-2)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--accent-2)" stopOpacity="0" />
          </linearGradient>
          <clipPath id="backdrop-page">
            <path d="M4 0 H36 L48 12 V64 A4 4 0 0 1 44 68 H4 A4 4 0 0 1 0 64 V4 A4 4 0 0 1 4 0 Z" />
          </clipPath>
        </defs>

        <g transform="translate(64 64)">
          <g transform="translate(-26 -33)">
            <path
              className="sheet"
              d="M4 0 H36 L48 12 V64 A4 4 0 0 1 44 68 H4 A4 4 0 0 1 0 64 V4 A4 4 0 0 1 4 0 Z"
            />
            <path className="fold" d="M36 0 L48 12 H38 A2 2 0 0 1 36 10 Z" />
            <g className="lines">
              <rect x="9" y="24" width="30" height="3.4" rx="1.7" />
              <rect x="9" y="33" width="22" height="3.4" rx="1.7" />
              <rect x="9" y="42" width="30" height="3.4" rx="1.7" />
              <rect x="9" y="51" width="17" height="3.4" rx="1.7" />
            </g>
            {/* Clipped to the sheet so the light only falls on the page. */}
            <g clipPath="url(#backdrop-page)">
              <rect className="beam" x="-7" y="-12" width="62" height="7" rx="3.5" fill="url(#backdrop-beam)" />
            </g>
          </g>

          <g className="brackets">
            <path d="M-42 -30 V-40 A4 4 0 0 1 -38 -44 H-28" />
            <path d="M42 -30 V-40 A4 4 0 0 0 38 -44 H28" />
            <path d="M-42 30 V40 A4 4 0 0 0 -38 44 H-28" />
            <path d="M42 30 V40 A4 4 0 0 1 38 44 H28" />
          </g>
        </g>
      </svg>
    </div>
  );
}
