import Link from "next/link";
import { notFound } from "next/navigation";
import { ClaimCard } from "@/components/ClaimCard";
import { EditPanel } from "@/components/EditPanel";
import { apiGet, KIND_LABEL, type Project } from "@/lib/api";

export const dynamic = "force-dynamic";

const KIND_TEXT: Record<string, string> = { environment: "Environment", code: "Code", data: "Data", protocol: "Protocol" };
const DATASET_STATUS: Record<string, { label: string; color: string; glyph: string }> = {
  available: { label: "Available", color: "var(--good)", glyph: "✓" },
  partial: { label: "Differs from paper", color: "var(--warning)", glyph: "!" },
  unavailable: { label: "Not available", color: "var(--neutral)", glyph: "⊘" },
};

function SectionHead({ n, title, aside }: { n: string; title: string; aside?: React.ReactNode }) {
  return (
    <div className="section-head">
      <span className="marker">§ {n}</span>
      <h2>{title}</h2>
      {aside && <span className="ml-auto text-xs text-ink-3">{aside}</span>}
    </div>
  );
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await apiGet<Project>(`/api/projects/${encodeURIComponent(slug)}`);
  if (!project) notFound();
  const { paper } = project;
  const count = (v: string) => project.claims.filter((c) => c.verdict === v).length;
  const open = project.claims.filter((c) => !c.verdict).length;
  const readout: [number, string, string?][] = [
    [count("matched"), "matched", "var(--good)"],
    [count("not_matched"), "did not match", "var(--critical)"],
    [count("inconclusive") + open, "inconclusive or open", "var(--warning)"],
    [count("blocked"), "blocked", "var(--neutral)"],
    [project.runs, "runs recorded"],
  ];
  const datasetName = Object.fromEntries(project.datasets.map((d) => [d.key, d.name]));

  return (
    <div className="space-y-16">
      <header className="rise">
        <p className="eyebrow">
          <Link href="/" className="!text-ink-3 hover:!text-ink">
            Reproductions
          </Link>{" "}
          / Record · {KIND_LABEL[project.kind] ?? project.kind}
        </p>
        <h1 className="display mt-4 text-[36px] sm:text-[52px]">{project.title}</h1>
        <p className="lede mt-4 max-w-3xl">
          {paper.authors.join(", ")}. <em>{paper.title}.</em> {paper.venue}
        </p>
        {project.summary && <p className="mt-3 max-w-3xl text-[15px] text-ink-2">{project.summary}</p>}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <dl className="grid max-w-3xl gap-x-8 gap-y-2.5 text-sm sm:grid-cols-[88px_1fr]">
            <dt className="label !mb-0 pt-0.5">Paper</dt>
            <dd>{paper.url ? <a href={paper.url}>{paper.url.replace(/^https?:\/\//, "")}</a> : "Not recorded"}</dd>
            <dt className="label !mb-0 pt-0.5">Code</dt>
            <dd className="break-all">
              {project.code_url ? <a href={project.code_url}>{project.code_url.replace(/^https?:\/\//, "")}</a> : "Not recorded"}
              {project.code_commit && (
                <span className="mono ml-2 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink-2">{project.code_commit.slice(0, 12)}</span>
              )}
            </dd>
            <dt className="label !mb-0 pt-0.5">Data</dt>
            <dd className="text-ink-2">{project.data_note ?? "Not recorded"}</dd>
          </dl>
          <a href={`/api/projects/${project.slug}/report.md`} className="btn btn-ghost self-start !no-underline lg:self-end">
            Download report (.md)
          </a>
        </div>

        <div className="sheet mt-10 grid grid-cols-2 gap-px overflow-hidden !bg-[var(--border)] sm:grid-cols-5">
          {readout.map(([value, label, color]) => (
            <div key={label} className="bg-surface px-5 py-5 last:col-span-2 sm:last:col-span-1">
              <div className="num text-[34px] font-light leading-none tracking-tight">{value}</div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-2">
                {color && <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: color }} />}
                {label}
              </div>
            </div>
          ))}
        </div>
      </header>

      <section className="space-y-6">
        <SectionHead n="01" title="Claims" aside={<span className="mono">{project.claims.length} from the paper</span>} />
        {project.claims.length === 0 && (
          <p className="sheet px-5 py-4 text-sm text-ink-2">No claims yet. Add the numbers you are trying to reproduce under § 05.</p>
        )}
        {project.claims.map((claim, i) => (
          <ClaimCard key={claim.key} claim={claim} index={`1.${i + 1}`} datasetName={claim.dataset_key ? datasetName[claim.dataset_key] : undefined} />
        ))}
      </section>

      <section className="space-y-6">
        <SectionHead n="02" title="Datasets" aside={<Link href="/graph" className="mono">see them in the graph →</Link>} />
        {project.datasets.length === 0 ? (
          <p className="sheet px-5 py-4 text-sm text-ink-2">None recorded.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {project.datasets.map((d) => {
              const st = DATASET_STATUS[d.status] ?? DATASET_STATUS.available;
              return (
                <div key={d.key} className="sheet p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="title text-lg">{d.name}</h3>
                    <span className="chip shrink-0">
                      <span aria-hidden className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: st.color }}>
                        {st.glyph}
                      </span>
                      {st.label}
                    </span>
                  </div>
                  {d.sources.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm">
                      {d.sources.map((s, i) => (
                        <li key={i} className="text-ink-2">
                          <span className="mono text-[11px] uppercase tracking-[0.06em] text-ink-3">{s.relation}</span>{" "}
                          {s.arxiv_id ? <a href={`https://arxiv.org/abs/${s.arxiv_id}`}>{s.title}</a> : s.doi ? <a href={`https://doi.org/${s.doi}`}>{s.title}</a> : s.title}
                          {s.year ? ` (${s.year})` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                  {d.note && <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-ink-3">{d.note}</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-6">
        <SectionHead n="03" title="Deviations from the original" aside={<span className="mono">{project.deviations.length} logged</span>} />
        {project.deviations.length === 0 ? (
          <p className="sheet px-5 py-4 text-sm text-ink-2">None recorded.</p>
        ) : (
          <ol className="sheet divide-y divide-line">
            {project.deviations.map((d) => (
              <li key={d.key} className="grid gap-3 p-5 sm:grid-cols-[64px_1fr_1fr] sm:gap-6">
                <div>
                  <div className="mono text-sm font-medium">{d.key}</div>
                  <div className="mono mt-1 text-[10px] uppercase tracking-[0.08em] text-ink-3">{KIND_TEXT[d.kind] ?? d.kind}</div>
                </div>
                <div>
                  <p className="text-[15px]">{d.what}</p>
                  {d.applies_to && <p className="mt-1 text-xs text-ink-3">Applies to {d.applies_to}</p>}
                </div>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="label !mb-0.5">Why</dt>
                    <dd className="text-ink-2">{d.why ?? "–"}</dd>
                  </div>
                  <div>
                    <dt className="label !mb-0.5">Expected effect</dt>
                    <dd className="text-ink-2">{d.expected_effect ?? "–"}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-6">
        <SectionHead n="04" title="Record a run" />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[1fr_1.4fr]">
          <p className="text-[15px] text-ink-2">
            Wrap the command you would have run anyway. The code is not edited; the command, code version, environment and the numbers you name are recorded and
            sent here. Runs that cannot be sent are kept on disk until <code className="mono text-[13px]">papertrail sync</code>.
          </p>
          <figure>
            <pre className="mono overflow-x-auto rounded-xl bg-[#0f1b2d] p-5 text-[12.5px] leading-relaxed text-[#e8ebf2] shadow-float">
              <span className="text-[#8b97ad]"># once per shell</span>
              {"\n"}export PAPERTRAIL_URL=<span className="text-[#ffb98f]">&lt;this site&gt;</span> PAPERTRAIL_PROJECT=<span className="text-[#9fd7b9]">{project.slug}</span>
              {"\n"}export PAPERTRAIL_TOKEN=<span className="text-[#ffb98f]">&lt;project token&gt;</span>
              {"\n\n"}papertrail run --run-set cora --seed 0 \{"\n"}  --metric <span className="text-[#9fd7b9]">&apos;test_accuracy=accuracy= ([0-9.]+)&apos;</span> \{"\n"}  -- python train.py --dataset cora
            </pre>
            <figcaption className="figcap mt-2">
              <b>FIG. 4</b>One recorded run. Repeat with other seeds to build a run set that matches the paper&apos;s protocol.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="space-y-6">
        <SectionHead n="05" title="Edit" />
        <EditPanel slug={project.slug} claims={project.claims.map((c) => ({ key: c.key, label: c.label }))} />
      </section>
    </div>
  );
}
