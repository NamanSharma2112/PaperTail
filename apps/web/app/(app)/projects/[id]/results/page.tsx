import { Plus, Sigma } from "lucide-react";
import { ComparisonCard, MetricDialog, type Comparison } from "@/components/ResultsPanel";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionHead } from "@/components/ui/misc";
import { pageData } from "@/lib/server/page";
import { rows } from "@/lib/server/services/common";
import { compareProject } from "@/lib/server/services/comparison";
import { getProject } from "@/lib/server/services/projects";

export default async function ResultsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await pageData(async (db) => ({
    project: await getProject(db, id),
    comparisons: (await compareProject(db, id)) as unknown as Comparison[],
    groups: (await rows<{ run_group: string }>(db, "select distinct run_group from experiment_runs where project_id = $1 order by 1", [id])).map((r) => r.run_group),
    datasets: await rows<{ key: string; name: string }>(db, "select key, name from datasets where project_id = $1 order by created_at", [id]),
  }));
  const canEdit = d.project.role !== "viewer";
  const add = canEdit && <MetricDialog projectId={id} groups={d.groups} datasets={d.datasets} trigger={<Button><Plus /> Add published result</Button>} />;
  return (
    <div className="space-y-6">
      <SectionHead n="01" title="Published versus reproduced" aside={add} />
      <p className="max-w-3xl text-sm text-ink-2">
        Four kinds of information are kept apart here: the value the authors reported, your independent runs, the summaries PaperTrail calculates, and your own conclusion.
        Closeness is not equivalence; when a comparison is not valid, it says so.
      </p>
      {d.comparisons.length === 0 ? (
        <EmptyState icon={<Sigma />} title="No published results yet" action={add}>Enter each number from the paper you want to check, with how the paper aggregated it.</EmptyState>
      ) : (
        d.comparisons.map((c, i) => <ComparisonCard key={c.metric.id} c={c} index={`5.${i + 1}`} projectId={id} canEdit={canEdit} groups={d.groups} datasets={d.datasets} />)
      )}
      <details className="sheet p-5 text-sm">
        <summary className="cursor-pointer font-medium">How the numbers are calculated</summary>
        <div className="mt-3 space-y-2 text-ink-2">
          <p>Only completed runs that logged the metric are used; failed, cancelled and unfinished runs are counted and excluded. Each run contributes its last logged value.</p>
          <p><span className="mono">mean = Σx / n</span>, <span className="mono">SD = √(Σ(x − mean)² / (n − 1))</span>, <span className="mono">95% CI = mean ± t(0.975, n − 1) · SD / √n</span>. The interval assumes independent runs whose mean is roughly normal; with very few runs it is approximate.</p>
          <p>When the paper reports a mean of n runs but no spread, the interval for the difference assumes the paper&apos;s runs varied as much as yours: <span className="mono">SE = SD · √(1/n_yours + 1/n_paper)</span>. No significance test is run, because the paper&apos;s sampling assumptions are unknown.</p>
          <p>A comparison is marked not valid when runs in a group used different parameters (other than the seed), different dataset versions, or a unit that does not match the paper&apos;s without a scale factor.</p>
          <p>The statistics are implemented in <span className="mono">apps/web/lib/stats</span> and checked against the Python reference in <span className="mono">packages/analysis</span> (scipy) on shared test cases.</p>
        </div>
      </details>
    </div>
  );
}
