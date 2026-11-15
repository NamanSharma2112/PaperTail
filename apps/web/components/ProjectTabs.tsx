"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { seg: "", label: "Overview" },
  { seg: "paper", label: "Paper & methodology" },
  { seg: "protocol", label: "Reproduction protocol" },
  { seg: "experiments", label: "Experiments" },
  { seg: "results", label: "Results comparison" },
  { seg: "discrepancies", label: "Discrepancies" },
  { seg: "report", label: "Report" },
  { seg: "settings", label: "Settings" },
];

export function ProjectTabs({ id, counts }: { id: string; counts: Partial<Record<string, number>> }) {
  const path = usePathname() ?? "";
  const base = `/projects/${id}`;
  return (
    <nav aria-label="Project sections" className="-mx-4 mb-8 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0 print:hidden">
      <ul className="flex min-w-max gap-1">
        {TABS.map((t) => {
          const href = t.seg ? `${base}/${t.seg}` : base;
          const active = t.seg ? path === href || path.startsWith(href + "/") : path === base;
          return (
            <li key={t.seg}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex items-center gap-1.5 px-3 py-2.5 text-[13.5px] !no-underline transition-colors",
                  active ? "font-medium !text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-[var(--text-primary)]" : "!text-ink-2 hover:!text-ink",
                )}
              >
                {t.label}
                {counts[t.seg] ? <span className="num rounded-full bg-surface-3 px-1.5 text-[10.5px] text-ink-2">{counts[t.seg]}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
