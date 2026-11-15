/** PaperTrail mark: a claim (dot) traced to its evidence (square) along a dotted line. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 22 22">
      <rect x="0.5" y="0.5" width="21" height="21" rx="6" fill="var(--text-primary)" />
      <circle cx="7" cy="14.5" r="2.6" fill="var(--surface)" />
      <rect x="12.4" y="4.8" width="5" height="5" rx="1.2" fill="var(--series-2)" />
      <path d="M8.9 12.6 L12.6 9" stroke="var(--surface)" strokeWidth="1.3" strokeDasharray="1.4 1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Mark />
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">PaperTrail</span>
    </span>
  );
}
