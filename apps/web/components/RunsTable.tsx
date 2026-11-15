"use client";
import { GitCompareArrows } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/misc";
import { duration, timeAgo } from "@/lib/utils";

type Run = { id: string; name: string; run_group: string; status: string; seed: number | null; git_commit: string | null; started_at: string | null; created_at: string; duration_seconds: number | null; failure_summary: string | null; metrics: Record<string, number> };

export function RunsTable({ projectId, runs }: { projectId: string; runs: Run[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>([]);
  const metricNames = [...new Set(runs.flatMap((r) => Object.keys(r.metrics ?? {})))].sort().slice(0, 4);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 10 ? s : [...s, id]));
  return (
    <div>
      <div className="mb-3 flex items-center gap-3 text-sm">
        <span className="text-ink-3">{sel.length ? `${sel.length} selected` : "Select 2–10 runs to compare them side by side."}</span>
        <Button size="sm" variant="secondary" disabled={sel.length < 2} onClick={() => router.push(`/projects/${projectId}/experiments/compare?ids=${sel.join(",")}`)}><GitCompareArrows /> Compare</Button>
      </div>
      <div className="sheet overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="mono border-b border-line text-left text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
              <th className="w-10 py-2.5 pl-4"><span className="sr-only">Select</span></th>
              <th className="py-2.5 pr-3 font-medium">Run</th>
              <th className="py-2.5 pr-3 font-medium">Status</th>
              <th className="py-2.5 pr-3 font-medium">Seed</th>
              {metricNames.map((m) => <th key={m} className="py-2.5 pr-3 text-right font-medium">{m}</th>)}
              <th className="py-2.5 pr-3 font-medium">Commit</th>
              <th className="py-2.5 pr-3 font-medium">Duration</th>
              <th className="py-2.5 pr-4 font-medium">Started</th>
            </tr>
          </thead>
          <tbody className="num">
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                <td className="py-2 pl-4"><input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.includes(r.id)} onChange={() => toggle(r.id)} className="size-4 accent-[var(--text-primary)]" /></td>
                <td className="py-2 pr-3">
                  <Link href={`/projects/${projectId}/experiments/${r.id}`} className="font-medium">{r.name}</Link>
                  <span className="mono ml-2 text-[11px] text-ink-3">{r.run_group}</span>
                  {r.status === "failed" && r.failure_summary && <span className="block max-w-[300px] truncate text-xs text-[var(--critical)]">{r.failure_summary.split("\n")[0]}</span>}
                </td>
                <td className="py-2 pr-3"><StatusBadge status={r.status} /></td>
                <td className="py-2 pr-3">{r.seed ?? "–"}</td>
                {metricNames.map((m) => <td key={m} className="py-2 pr-3 text-right">{r.metrics?.[m] !== undefined ? Number(r.metrics[m]).toPrecision(5) : "–"}</td>)}
                <td className="mono py-2 pr-3 text-xs text-ink-2">{r.git_commit ? r.git_commit.slice(0, 8) : "–"}</td>
                <td className="py-2 pr-3 text-ink-2">{duration(r.duration_seconds)}</td>
                <td className="py-2 pr-4 text-ink-2">{timeAgo(r.started_at ?? r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
