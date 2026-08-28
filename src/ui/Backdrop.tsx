import { useReducedMotion } from './useReducedMotion';

/**
 * The app mark sitting behind the library as a watermark: the page in
 * viewfinder brackets, with the scan beam sweeping down it and the printed
 * content appearing in the beam's wake, as though it were being scanned in.
 *
 * Geometry mirrors scripts/logo.mjs, which is the source for the favicon and
 * the launcher icons — keep the two in step if the mark changes.
 *
 * The beam and the reveal are animated with SMIL rather than CSS. CSS
 * animations do not run on elements inside a `<clipPath>`, which are never
 * rendered, so a CSS-driven clip stays frozen at its rest position and hides
 * the page completely. SMIL also puts both on the SVG's own timeline, so they
 * cannot start a frame apart and drift.
 *
 * Purely decorative: hidden from assistive tech, and it never takes pointer
 * events from the list on top of it.
 */

/** One sweep, matching the easing the rest of the interface uses. */
const DUR = '6.5s';
const SWEEP = {
  keyTimes: '0; 0.7; 1',
  calcMode: 'spline' as const,
  // Ease through the sweep, then hold still for the tail of the cycle.
  keySplines: '.55 0 .45 1; 0 0 1 1',
  dur: DUR,
  repeatCount: 'indefinite' as const,
};

export default function Backdrop() {
  const reduced = useReducedMotion();

  // With no sweep there is nothing to reveal the page, so show all of it —
  // otherwise the mark would be an empty outline.
  const revealY = reduced ? -42.5 : -128.5;

  return (
    <div className="backdrop" aria-hidden="true">
      {/* Sheets adrift far behind the mark, at three depths. Nothing here is
          load-bearing; it stops the page reading as flat colour. */}
      <div className="drift">
        <span className="sheet-ghost s1" />
        <span className="sheet-ghost s2" />
        <span className="sheet-ghost s3" />
      </div>

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
          <clipPath id="backdrop-photo">
            <rect x="4" y="4" width="40" height="60" rx="3" />
          </clipPath>
          {/*
            Reveal window. Its lower edge starts on the beam's centre line and
            rides the identical sweep, so the content appears exactly as the
            beam passes over it rather than merely near it.
          */}
          <clipPath id="backdrop-reveal">
            <rect x="-40" y={revealY} width="140" height="120">
              {!reduced && (
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values="0 0; 0 86; 0 86"
                  {...SWEEP}
                />
              )}
            </rect>
          </clipPath>
        </defs>

        <g transform="translate(64 64)">
          <g transform="translate(-26 -33)">
            <path
              className="sheet"
              d="M4 0 H36 L48 12 V64 A4 4 0 0 1 44 68 H4 A4 4 0 0 1 0 64 V4 A4 4 0 0 1 4 0 Z"
            />
            <path className="fold" d="M36 0 L48 12 H38 A2 2 0 0 1 36 10 Z" />

            {/* The page and its frame stay put; only what is printed on it is
                revealed by the passing beam. */}
            <g clipPath="url(#backdrop-reveal)">
              <image
                className="photo"
                href={`${import.meta.env.BASE_URL}brand/contour.png`}
                x="5"
                y="4"
                width="38"
                height="45"
                preserveAspectRatio="xMidYMid meet"
                clipPath="url(#backdrop-photo)"
              />
              <g className="lines">
                <rect x="11" y="54" width="26" height="3" rx="1.5" />
                <rect x="11" y="60" width="17" height="3" rx="1.5" />
              </g>
            </g>

            {/* Clipped to the sheet so the light only falls on the page. */}
            <g clipPath="url(#backdrop-page)">
              <rect
                className="beam"
                x="-7"
                y="-12"
                width="62"
                height="7"
                rx="3.5"
                fill="url(#backdrop-beam)"
                opacity={reduced ? 0.5 : undefined}
                transform={reduced ? 'translate(0 42)' : undefined}
              >
                {!reduced && (
                  <>
                    <animateTransform
                      attributeName="transform"
                      type="translate"
                      values="0 0; 0 86; 0 86"
                      {...SWEEP}
                    />
                    <animate
                      attributeName="opacity"
                      values="0; 1; 1; 0"
                      keyTimes="0; 0.08; 0.62; 0.7"
                      dur={DUR}
                      repeatCount="indefinite"
                    />
                  </>
                )}
              </rect>
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
