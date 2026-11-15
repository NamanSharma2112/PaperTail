import { cn } from "@/lib/utils";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("sheet p-5 sm:p-6", className)} {...props}>
      {children}
    </div>
  );
}

export function SectionHead({ n, title, aside, className }: { n?: string; title: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("section-head", className)}>
      {n && <span className="marker">§ {n}</span>}
      <h2>{title}</h2>
      {aside && <div className="ml-auto flex items-center gap-2 text-xs text-ink-3">{aside}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="sheet dot-grid flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 rounded-2xl border border-line bg-surface p-3 text-ink-2 shadow-card [&_svg]:size-5">{icon}</div>}
      <h3 className="title text-lg">{title}</h3>
      {children && <div className="mt-1.5 max-w-md text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-3", className)} />;
}

const STATUS_STYLE: Record<string, { color: string; glyph: string }> = {
  completed: { color: "var(--good)", glyph: "✓" },
  matched: { color: "var(--good)", glyph: "✓" },
  successful: { color: "var(--good)", glyph: "✓" },
  resolved: { color: "var(--good)", glyph: "✓" },
  running: { color: "var(--accent)", glyph: "◉" },
  in_progress: { color: "var(--accent)", glyph: "◉" },
  investigating: { color: "var(--accent)", glyph: "◉" },
  pending: { color: "var(--neutral)", glyph: "…" },
  planning: { color: "var(--neutral)", glyph: "…" },
  open: { color: "var(--warning)", glyph: "!" },
  failed: { color: "var(--critical)", glyph: "✕" },
  not_matched: { color: "var(--critical)", glyph: "✕" },
  not_reproduced: { color: "var(--critical)", glyph: "✕" },
  inconclusive: { color: "var(--warning)", glyph: "?" },
  partial: { color: "var(--warning)", glyph: "◐" },
  cancelled: { color: "var(--neutral)", glyph: "–" },
  blocked: { color: "var(--neutral)", glyph: "⊘" },
  archived: { color: "var(--neutral)", glyph: "▢" },
  wont_fix: { color: "var(--neutral)", glyph: "–" },
  completed_project: { color: "var(--good)", glyph: "✓" },
};

/** Status with icon and words, never colour alone. */
export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const s = STATUS_STYLE[status] ?? { color: "var(--neutral)", glyph: "·" };
  return (
    <span className={cn("chip shrink-0 !py-0.5 font-medium text-ink", className)}>
      <span aria-hidden className="inline-flex size-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: s.color }}>
        {s.glyph}
      </span>
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}

const SEVERITY_COLOR: Record<string, string> = { low: "var(--neutral)", medium: "var(--warning)", high: "var(--serious, #ec835a)", critical: "var(--critical)" };
export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className="chip !py-0.5">
      <span aria-hidden className="size-2 rounded-sm" style={{ background: SEVERITY_COLOR[severity] }} />
      {severity}
    </span>
  );
}

export function Stat({ value, label, sub }: { value: React.ReactNode; label: string; sub?: React.ReactNode }) {
  return (
    <div className="bg-surface px-5 py-4">
      <div className="num text-[30px] font-light leading-none tracking-tight">{value}</div>
      <div className="mt-2 text-xs text-ink-2">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-ink-3">{sub}</div>}
    </div>
  );
}

export function StatGrid({ children, cols = 4 }: { children: React.ReactNode; cols?: 2 | 3 | 4 | 5 }) {
  const c = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-5" }[cols];
  return <div className={cn("sheet grid grid-cols-2 gap-px overflow-hidden !bg-[var(--border)]", c)}>{children}</div>;
}
