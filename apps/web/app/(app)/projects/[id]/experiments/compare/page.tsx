import Link from "next/link";
import { SectionHead } from "@/components/ui/misc";
import { pageData } from "@/lib/server/page";
import { compareRuns } from "@/lib/server/services/runs";
import { cn } from "@/lib/utils";

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export default async function CompareRuns({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ids?: string }> }) {
  const { id } = await params;
  const ids = ((await searchParams).ids ?? "").split(",").filter(isUuid).slice(0, 10);
  if (ids.length < 2) return <p className="text-sm text-ink-2">Choose at least two runs on the <Link href={`/projects/${id}/experiments`}>Experiments</Link> tab.</p>;
  const c = await pageData((db) => compareRuns(db, id, ids));
  const Row = ({ name, values, differs, mono }: { name: string; values: unknown[]; differs?: boolean; mono?: boolean }) => (
    <tr className={cn("border-b border-line last:border-0", differs && "bg-[color-mix(in_oklab,var(--warning)_10%,transparent)]")}>
      <th scope="row" className="mono py-2 pl-4 pr-3 text-left text-xs font-normal text-ink-2">{name}{differs && <span className="sr-only"> (differs)</span>}</th>
      {values.map((v, i) => <td key={i} className={cn("py-2 pr-4 text-right", mono && "mono text-xs")}>{v === null || v === undefined ? "–" : typeof v === "number" ? (Number.isInteger(v) ? v : v.toPrecision(6)) : String(v).slice(0, 40)}</td>)}
    </tr>
  );
  return (
    <div className="space-y-8">
      <p className="text-sm"><Link href={`/projects/${id}/experiments`}>← Experiments</Link></p>
      <SectionHead title={`Comparing ${c.runs.length} runs`} aside="Highlighted rows differ between runs." />
      <div className="sheet overflow-x-auto">
        <table className="num w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line"><th className="py-2.5 pl-4 text-left"><span className="sr-only">Field</span></th>{c.runs.map((r) => <th key={r.id} className="py-2.5 pr-4 text-right font-medium"><Link href={`/projects/${id}/experiments/${r.id}`}>{r.name}</Link><span className="block text-xs font-normal text-ink-3">{r.status}</span></th>)}</tr>
          </thead>
          <tbody>
            <tr><td colSpan={c.runs.length + 1} className="label px-4 pt-4">Metrics (final values)</td></tr>
            {c.metrics.map((m) => <Row key={m.name} name={m.name} values={m.values} />)}
            <tr><td colSpan={c.runs.length + 1} className="label px-4 pt-4">Parameters</td></tr>
            {c.parameters.map((p) => <Row key={p.name} name={p.name} values={p.values.map((v) => (typeof v === "object" ? JSON.stringify(v) : v))} differs={p.differs} mono />)}
            <tr><td colSpan={c.runs.length + 1} className="label px-4 pt-4">Environment</td></tr>
            {c.environment.map((p) => <Row key={p.name} name={p.name.replace(/_/g, " ")} values={p.values.map((v) => (p.name === "git_commit" && v ? String(v).slice(0, 10) : v))} differs={p.differs} mono />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
