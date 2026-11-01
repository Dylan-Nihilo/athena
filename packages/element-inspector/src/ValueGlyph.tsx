import { useId } from 'react';

export type Measurement =
  'radius' | 'opacity' | 'weight' | 'size' | 'spacing' | 'width' | 'height' | 'tracking' | 'stroke';

/** A compact, proportional specimen of the measurement beside its rail. */
export function ValueGlyph({
  kind,
  value,
  fraction,
}: {
  kind: Measurement;
  value: number;
  fraction: number;
}) {
  const pattern = useId();
  const t = Math.max(0, Math.min(1, fraction));
  if (kind === 'weight' || kind === 'size' || kind === 'tracking') {
    return (
      <span
        className="ei-type-specimen"
        aria-hidden
        style={{
          fontSize: kind === 'size' ? 11 + t * 8 : 14,
          letterSpacing: kind === 'tracking' ? t * 1.8 : '-.06em',
          fontWeight: kind === 'weight' ? value : 550,
        }}
      >
        Aa
      </span>
    );
  }
  const inset = 2 + 4 * t;
  return (
    <svg
      className="ei-geometry"
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === 'radius' && (
        <>
          <path className="ei-construction" d="M4 5h15v15" />
          <path d={`M4 5h${15 - t * 13}q${t * 13} 0 ${t * 13} ${t * 13}V20`} />
        </>
      )}
      {kind === 'opacity' && (
        <>
          <defs>
            <pattern id={pattern} width="6" height="6" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill="white" />
              <path d="M0 0h3v3H0zm3 3h3v3H3z" fill="#c8ccd7" />
            </pattern>
          </defs>
          <circle cx="12" cy="12" r="8" fill={`url(#${pattern})`} />
          <circle cx="12" cy="12" r="8" fill="currentColor" fillOpacity={t} />
        </>
      )}
      {kind === 'spacing' && (
        <>
          <rect className="ei-construction" x="2.5" y="2.5" width="19" height="19" rx="2" />
          <rect
            x={3 + inset}
            y={3 + inset}
            width={18 - inset * 2}
            height={18 - inset * 2}
            rx="1.5"
            fill="currentColor"
            fillOpacity=".12"
          />
        </>
      )}
      {(kind === 'width' || kind === 'height') && (
        <g transform={kind === 'height' ? 'rotate(90 12 12)' : undefined}>
          <path d="M3 6v12m18-12v12m-18-6h18m-14-3-3 3 3 3m10-6 3 3-3 3" />
        </g>
      )}
      {kind === 'stroke' && (
        <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth={1 + 4 * t} />
      )}
    </svg>
  );
}
