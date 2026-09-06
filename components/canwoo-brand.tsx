// Eleven gold-paper folds with an arched hem and fine exposed fan bones.
export function CanwooMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 80 64" aria-hidden="true">
      <path
        d="M38.42 53.78L26.93 44.92M38.70 53.48L29.23 42.50M39.03 53.25L31.98 40.58M39.40 53.09L35.05 39.26M39.80 53.01L38.33 38.58M40.20 53.01L41.67 38.58M40.60 53.09L44.95 39.26M40.97 53.25L48.02 40.58M41.30 53.48L50.77 42.50M41.58 53.78L53.07 44.92"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.72"
        strokeLinecap="round"
      />
      <path
        d="M2.39 36.31A42 42 0 0 1 6.55 29.60L27.66 45.63A15.5 15.5 0 0 0 26.12 48.10Z"
        fill="currentColor"
        opacity="1"
      />
      <path
        d="M6.93 29.11A42 42 0 0 1 12.36 23.37L29.80 43.33A15.5 15.5 0 0 0 27.80 45.45Z"
        fill="currentColor"
        opacity="0.82"
      />
      <path
        d="M12.83 22.97A42 42 0 0 1 19.31 18.45L32.36 41.51A15.5 15.5 0 0 0 29.97 43.18Z"
        fill="currentColor"
        opacity="1"
      />
      <path
        d="M19.85 18.15A42 42 0 0 1 27.11 15.03L35.24 40.25A15.5 15.5 0 0 0 32.56 41.40Z"
        fill="currentColor"
        opacity="0.82"
      />
      <path
        d="M27.70 14.84A42 42 0 0 1 35.44 13.25L38.32 39.59A15.5 15.5 0 0 0 35.46 40.18Z"
        fill="currentColor"
        opacity="1"
      />
      <path
        d="M36.05 13.19A42 42 0 0 1 43.95 13.19L41.46 39.57A15.5 15.5 0 0 0 38.54 39.57Z"
        fill="currentColor"
        opacity="0.82"
      />
      <path
        d="M44.56 13.25A42 42 0 0 1 52.30 14.84L44.54 40.18A15.5 15.5 0 0 0 41.68 39.59Z"
        fill="currentColor"
        opacity="1"
      />
      <path
        d="M52.89 15.03A42 42 0 0 1 60.15 18.15L47.44 41.40A15.5 15.5 0 0 0 44.76 40.25Z"
        fill="currentColor"
        opacity="0.82"
      />
      <path
        d="M60.69 18.45A42 42 0 0 1 67.17 22.97L50.03 43.18A15.5 15.5 0 0 0 47.64 41.51Z"
        fill="currentColor"
        opacity="1"
      />
      <path
        d="M67.64 23.37A42 42 0 0 1 73.07 29.11L52.20 45.45A15.5 15.5 0 0 0 50.20 43.33Z"
        fill="currentColor"
        opacity="0.82"
      />
      <path
        d="M73.45 29.60A42 42 0 0 1 77.61 36.31L53.88 48.10A15.5 15.5 0 0 0 52.34 45.63Z"
        fill="currentColor"
        opacity="1"
      />
      <path
        d="M1.71 36.33L39.05 54.58Q40 55.25 40.95 54.58L78.29 36.33"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="40" cy="55" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function CanwooBrand({ tagline }: { tagline?: string }) {
  return (
    <span
      className={`canwoo-brand${tagline ? ' has-tagline' : ''}`}
      aria-label="Canwoo 参伍"
    >
      <CanwooMark className="brand-mark" />
      <span className="brand-copy">
        <span className="brand-wordmark" aria-hidden="true">
          <span className="brand-latin">canwoo</span>
          <span className="brand-chinese" lang="zh-CN">
            参伍
          </span>
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
