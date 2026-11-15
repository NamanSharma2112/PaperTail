import Link from "next/link";
import { notFound } from "next/navigation";
import { ClaimCard } from "@/components/ClaimCard";
import { EditPanel } from "@/components/EditPanel";
import { apiGet, KIND_LABEL, type Project } from "@/lib/api";

export const dynamic = "force-dynamic";

const KIND_TEXT: Record<string, string> = {
  environment: "Environment",
  code: "Code",
  data: "Data",
  protocol: "Protocol",
};

function Tile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="num text-2xl font-bold">{value}</div>
      <div className="text-xs text-ink-2">{label}</div>
    </div>
  );
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await apiGet<Project>(`/api/projects/${encodeURIComponent(slug)}`);
  if (!project) notFound();
  const { paper } = project;
  const verdict = (v: string) => project.claims.filter((c) => c.verdict === v).length;
  const undecided = project.claims.filter((c) => !c.verdict).length;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs text-ink-3">
          <Link href="/">All reproductions</Link> / {KIND_LABEL[project.kind] ?? project.kind}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{project.title}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {paper.authors.join(", ")}. <em>{paper.title}.</em> {paper.venue}
        </p>
        {project.summary && <p className="mt-3 max-w-3xl text-sm">{project.summary}</p>}
        <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-ink-3">Paper</dt>
          <dd>{paper.url ? <a href={paper.url}>{paper.url.replace(/^https?:\/\//, "")}</a> : "Not recorded"}</dd>
          <dt className="text-ink-3">Code</dt>
          <dd className="break-all">
            {project.code_url ? <a href={project.code_url}>{project.code_url.replace(/^https?:\/\//, "")}</a> : "Not recorded"}
            {project.code_commit && (
              <>
                {" "}
                at <code className="font-mono text-xs">{project.code_commit.slice(0, 12)}</code>
              </>
            )}
          </dd>
          <dt className="text-ink-3">Data</dt>
          <dd>{project.data_note ?? "Not recorded"}</dd>
        </dl>
        <p className="mt-4 text-sm">
          <a href={`/api/projects/${project.slug}/report.md`}>Download the reproduction report (Markdown)</a>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile value={verdict("matched")} label="claims matched" />
        <Tile value={verdict("not_matched")} label="did not match" />
        <Tile value={verdict("inconclusive") + undecided} label="inconclusive or open" />
        <Tile value={verdict("blocked")} label="blocked" />
        <Tile value={project.runs} label="runs recorded" />
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Claims</h2>
        {project.claims.length === 0 && (
          <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-2">
            No claims yet. Add the numbers you are trying to reproduce under “Edit this project”.
          </p>
        )}
        {project.claims.map((claim) => (
          <ClaimCard key={claim.key} claim={claim} />
        ))}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Deviations from the original</h2>
        {project.deviations.length === 0 ? (
          <p className="mt-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-2">None recorded.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th className="px-4 py-2 font-semibold">ID</th>
                  <th className="px-4 py-2 font-semibold">Type</th>
                  <th className="px-4 py-2 font-semibold">What changed</th>
                  <th className="px-4 py-2 font-semibold">Why</th>
                  <th className="px-4 py-2 font-semibold">Expected effect</th>
                </tr>
              </thead>
              <tbody>
                {project.deviations.map((d) => (
                  <tr key={d.key} className="border-b border-line align-top last:border-0">
                    <td className="px-4 py-2 font-semibold">{d.key}</td>
                    <td className="px-4 py-2">{KIND_TEXT[d.kind] ?? d.kind}</td>
                    <td className="px-4 py-2">
                      {d.what}
                      {d.applies_to && <div className="mt-0.5 text-xs text-ink-3">Applies to {d.applies_to}</div>}
                    </td>
                    <td className="px-4 py-2 text-ink-2">{d.why ?? "–"}</td>
                    <td className="px-4 py-2 text-ink-2">{d.expected_effect ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Record a run</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Wrap the command you would have run anyway. The code is not edited; the command, code version, environment and the numbers you name are recorded and sent here.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface p-4 font-mono text-xs leading-relaxed">
          {`export PAPERTRAIL_URL=<this site>  PAPERTRAIL_PROJECT=${project.slug}  PAPERTRAIL_TOKEN=<project token>

papertrail run --run-set cora --seed 0 \\
  --metric 'test_accuracy=accuracy= ([0-9.]+)' \\
  -- python train.py --dataset cora`}
        </pre>
      </section>

      <EditPanel slug={project.slug} claims={project.claims.map((c) => ({ key: c.key, label: c.label }))} />
    </div>
  );
}
