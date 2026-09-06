import { compactFanArt, fanArt, wordmarkPaths } from '@/lib/brand-art';

export function CanwooMark({
  className = '',
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const art = compact ? compactFanArt : fanArt;
  return (
    <svg className={className} viewBox="0 0 112 72" aria-hidden="true">
      {art.folds.map((fold, index) => (
        <path
          key={index}
          d={fold.d}
          fill={'shade' in fold ? '#201b12' : 'currentColor'}
          opacity={fold.opacity}
        />
      ))}
      <path
        d={art.ribs}
        fill="none"
        stroke="currentColor"
        strokeWidth={compact ? 1.3 : 0.8}
        strokeLinecap="round"
      />
      <path
        d={art.guard}
        fill="none"
        stroke="currentColor"
        strokeWidth={compact ? 2.2 : 1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="56" cy="66" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function CanwooWordmark() {
  return (
    <svg className="brand-latin" viewBox="0 0 212 42" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="5.5"
        strokeLinecap="butt"
        strokeLinejoin="round"
      >
        {wordmarkPaths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

// Matching monoline lettering for the two-character brand, with open counters
// and gently joined strokes. The parent lockup supplies its accessible name.
export function CanwooHanWordmark() {
  return (
    <svg className="brand-chinese" viewBox="0 0 64 32" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.35"
        strokeLinecap="butt"
        strokeLinejoin="round"
      >
        <path d="M15 2.5L7.5 8.5H23L18.5 4M3 12H28M14 8.5C12.5 14 8 18 2.5 20M16 12C19 16 23.5 19 28.5 20M18 17L10.5 21M21.5 21L11 25M25 25L12 29" />
        <path d="M42 3C40.5 8 37.5 13 34 16M39 10V29M46 5H61M44.5 15H58V27M52 5L48.5 27M43 27H63" />
      </g>
    </svg>
  );
}

export function CanwooBrand({ tagline }: { tagline?: string }) {
  return (
    <span
      className={`canwoo-brand${tagline ? ' has-tagline' : ''}`}
      aria-label="Canwoo 参伍"
    >
      <CanwooMark className="brand-mark" compact />
      <span className="brand-copy">
        <span className="brand-wordmark" aria-hidden="true">
          <CanwooWordmark />
          <CanwooHanWordmark />
        </span>
        {tagline && <small>{tagline}</small>}
      </span>
    </span>
  );
}
export function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.31 2.98-7.36Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.23-2.51c-.9.6-2.04.96-3.39.96-2.61 0-4.82-1.76-5.61-4.12H3.05v2.59A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.39 13.92a6.02 6.02 0 0 1 0-3.84V7.49H3.05a10 10 0 0 0 0 9.02l3.34-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.49l3.34 2.59C7.18 7.72 9.39 5.96 12 5.96Z"
      />
    </svg>
  );
}
