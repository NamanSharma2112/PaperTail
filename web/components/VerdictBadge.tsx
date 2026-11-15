import type { Verdict } from "@/lib/api";

const STYLE: Record<string, { label: string; glyph: string; color: string }> = {
  matched: { label: "Matched", glyph: "✓", color: "var(--good)" },
  not_matched: { label: "Did not match", glyph: "✕", color: "var(--critical)" },
  inconclusive: { label: "Inconclusive", glyph: "?", color: "var(--warning)" },
  blocked: { label: "Blocked", glyph: "⊘", color: "var(--neutral)" },
  none: { label: "No conclusion yet", glyph: "·", color: "var(--neutral)" },
};

/** The researcher's conclusion for a claim. Icon and label together; never colour alone. */
export function VerdictBadge({ verdict }: { verdict: Verdict | null }) {
  const s = STYLE[verdict ?? "none"];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink">
      <span
        aria-hidden
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ background: s.color }}
      >
        {s.glyph}
      </span>
      {s.label}
    </span>
  );
}

export const VERDICT_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(STYLE).map(([k, v]) => [k, v.label]),
);
