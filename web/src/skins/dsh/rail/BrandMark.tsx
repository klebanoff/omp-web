/**
 * The `omp` mark: a node tile with a terminal prompt inside. The tile takes
 * `--accent`, the glyph takes `currentColor`, so one component reads correctly
 * in both themes without a second asset.
 */
export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="24" height="24" rx="6" fill="var(--accent)" />
      <path
        d="M8 8.25 11.75 12 8 15.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13 16h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
