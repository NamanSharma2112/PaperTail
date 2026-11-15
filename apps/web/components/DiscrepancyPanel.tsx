"use client";
import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SeverityBadge, StatusBadge } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { CAUSE_STATUS, DISCREPANCY_CATEGORY, RESOLUTION, SEVERITY } from "@/lib/schemas";
import { api, timeAgo } from "@/lib/utils";

export const CATEGORY_LABEL: Record<string, string> = {
  missing_information: "Missing information", dataset_difference: "Dataset difference", dependency_conflict: "Dependency conflict", preprocessing_difference: "Preprocessing difference",
  hardware_difference: "Hardware difference", hyperparameter_difference: "Hyperparameter difference", implementation_difference: "Implementation difference", statistical_variation: "Statistical variation", other: "Other",
};
const CAUSE_LABEL: Record<string, string> = { suspected: "Suspected cause", confirmed: "Confirmed cause", ruled_out: "Ruled out" };

type D = { id: string; run_id: string | null; reported_metric_id: string | null; category: string; title: string; description: string | null; severity: string; explanation: string | null; cause_status: string; evidence: string | null; resolution_status: string; notes: string | null; created_at: string; run_name: string | null; reported_label: string | null };
type Opt = { id: string; label: string };

function DiscrepancyDialog({ projectId, d, runs, metrics, trigger, defaultOpen, defaultRun }: { projectId: string; d?: D; runs: Opt[]; metrics: Opt[]; trigger: React.ReactNode; defaultOpen?: boolean; defaultRun?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(!!defaultOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setError(null); }} wide title={d ? "Edit discrepancy" : "Record a discrepancy"} description="A difference between what the paper reports and what you observed, and what might explain it." trigger={trigger}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const val = (k: string) => (String(f.get(k) ?? "").trim() || null);
          const body = { category: f.get("category"), title: val("title"), description: val("description"), severity: f.get("severity"), explanation: val("explanation"), cause_status: f.get("cause_status"), evidence: val("evidence"), resolution_status: f.get("resolution_status"), notes: val("notes"), run_id: val("run_id"), reported_metric_id: val("reported_metric_id") };
          setBusy(true);
          setError(null);
          try {
            await api(d ? `/api/v1/discrepancies/${d.id}` : `/api/v1/projects/${projectId}/discrepancies`, { method: d ? "PATCH" : "POST", json: body });
            toast("success", d ? "Discrepancy updated" : "Discrepancy recorded");
            setOpen(false);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save");
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <p role="alert" className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-[var(--critical)]">{error}</p>}
        <Field label="Title" htmlFor="dc-title"><Input id="dc-title" name="title" defaultValue={d?.title} required maxLength={300} placeholder="Citeseer mean 0.7 points below the paper" /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Category" htmlFor="dc-cat"><Select id="dc-cat" name="category" defaultValue={d?.category ?? "statistical_variation"}>{DISCREPANCY_CATEGORY.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</Select></Field>
          <Field label="Severity" htmlFor="dc-sev"><Select id="dc-sev" name="severity" defaultValue={d?.severity ?? "medium"}>{SEVERITY.map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
          <Field label="Status" htmlFor="dc-res"><Select id="dc-res" name="resolution_status" defaultValue={d?.resolution_status ?? "open"}>{RESOLUTION.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</Select></Field>
        </div>
        <Field label="What was observed" htmlFor="dc-desc"><Textarea id="dc-desc" name="description" rows={3} defaultValue={d?.description ?? ""} /></Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <Field label="Possible explanation" htmlFor="dc-exp"><Textarea id="dc-exp" name="explanation" rows={3} defaultValue={d?.explanation ?? ""} /></Field>
          <Field label="Is the cause" htmlFor="dc-cause" hint="Keep suspicions separate from confirmed causes."><Select id="dc-cause" name="cause_status" defaultValue={d?.cause_status ?? "suspected"}>{CAUSE_STATUS.map((s) => <option key={s} value={s}>{CAUSE_LABEL[s]}</option>)}</Select></Field>
        </div>
        <Field label="Supporting evidence" htmlFor="dc-ev" hint="Log excerpts, links, line numbers."><Textarea id="dc-ev" name="evidence" rows={3} defaultValue={d?.evidence ?? ""} className="mono !text-[12.5px]" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Related run" htmlFor="dc-run"><Select id="dc-run" name="run_id" defaultValue={d?.run_id ?? defaultRun ?? ""}><option value="">None</option>{runs.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></Field>
          <Field label="Related published result" htmlFor="dc-rm"><Select id="dc-rm" name="reported_metric_id" defaultValue={d?.reported_metric_id ?? ""}><option value="">None</option>{metrics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
        </div>
        <Field label="Notes" htmlFor="dc-notes"><Textarea id="dc-notes" name="notes" rows={2} defaultValue={d?.notes ?? ""} /></Field>
        <div className="flex justify-end"><Button type="submit" loading={busy}>Save</Button></div>
      </form>
    </Dialog>
  );
}

export function DiscrepancyPanel({ projectId, items, runs, metrics, canEdit, openForRun }: { projectId: string; items: D[]; runs: Opt[]; metrics: Opt[]; canEdit: boolean; openForRun?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<"open" | "all">("all");
  const shown = filter === "open" ? items.filter((d) => d.resolution_status === "open" || d.resolution_status === "investigating") : items;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5" role="group" aria-label="Filter">
          {(["all", "open"] as const).map((f) => <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`chip ${filter === f ? "!bg-ink !text-surface" : ""}`}>{f === "all" ? `All ${items.length}` : `Open ${items.filter((d) => d.resolution_status === "open" || d.resolution_status === "investigating").length}`}</button>)}
        </div>
        {canEdit && <DiscrepancyDialog projectId={projectId} runs={runs} metrics={metrics} defaultOpen={!!openForRun} defaultRun={openForRun} trigger={<Button><Plus /> Record a discrepancy</Button>} />}
      </div>
      {shown.length === 0 ? (
        <p className="sheet px-5 py-6 text-sm text-ink-2">{items.length ? "No open discrepancies." : "None recorded. When a result differs from the paper, record what you observed and what might explain it."}</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((d) => (
            <li key={d.id} className="sheet p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge status={d.resolution_status} /><SeverityBadge severity={d.severity} /><span className="chip !py-0.5">{CATEGORY_LABEL[d.category]}</span></div>
                  <h3 className="title mt-2 text-lg">{d.title}</h3>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <DiscrepancyDialog projectId={projectId} d={d} runs={runs} metrics={metrics} trigger={<Button variant="ghost" size="icon" aria-label="Edit"><Pencil /></Button>} />
                    <ConfirmButton label="Delete" title="Delete this discrepancy?" description="It is removed from the record and the report." onConfirm={async () => { await api(`/api/v1/discrepancies/${d.id}`, { method: "DELETE" }); toast("success", "Deleted"); router.refresh(); }} />
                  </div>
                )}
              </div>
              {d.description && <p className="mt-2 text-sm text-ink-2">{d.description}</p>}
              {d.explanation && <p className="mt-3 text-sm"><span className="label !inline">{CAUSE_LABEL[d.cause_status]}</span> {d.explanation}</p>}
              {d.evidence && <pre className="mono mt-3 max-h-48 overflow-auto rounded-lg bg-surface-2 p-3 text-xs">{d.evidence}</pre>}
              <p className="mt-3 text-xs text-ink-3">{[d.run_name && `Run ${d.run_name}`, d.reported_label && `Result “${d.reported_label}”`, `recorded ${timeAgo(d.created_at)}`].filter(Boolean).join(" · ")}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
