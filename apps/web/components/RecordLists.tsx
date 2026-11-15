"use client";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/utils";

type Dataset = { id: string; key: string; name: string; status: string; url: string | null; version: string | null; note: string | null; sources: { relation: string; title: string; arxiv_id?: string | null; doi?: string | null; year?: number | null }[] };

function useSubmit() {
  const router = useRouter();
  const toast = useToast();
  return async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast("success", done);
      router.refresh();
      return true;
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "That did not work");
      return false;
    }
  };
}

export function DatasetDialog({ projectId, dataset, trigger }: { projectId: string; dataset?: Dataset; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = useSubmit();
  const [sources, setSources] = useState(dataset?.sources ?? []);
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setSources(dataset?.sources ?? []); }} title={dataset ? `Edit ${dataset.name}` : "Add a dataset"} trigger={trigger} wide>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          const ok = await submit(
            () => api(`/api/v1/projects/${projectId}/datasets`, {
              method: "PUT",
              json: {
                key: dataset?.key ?? String(f.get("key")),
                name: f.get("name"),
                status: f.get("status"),
                url: f.get("url"),
                version: f.get("version"),
                note: f.get("note"),
                sources: sources.filter((s) => s.title.trim()).map((s) => ({ ...s, year: s.year ? Number(s.year) : null })),
              },
            }),
            "Dataset saved",
          );
          setBusy(false);
          if (ok) setOpen(false);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="ds-name"><Input id="ds-name" name="name" defaultValue={dataset?.name} required /></Field>
          {!dataset && <Field label="Short key" htmlFor="ds-key" hint="Used to link published results, e.g. cora."><Input id="ds-key" name="key" className="mono !text-[13px]" required pattern="[A-Za-z0-9][A-Za-z0-9_.\-]*" /></Field>}
          <Field label="Availability" htmlFor="ds-status">
            <Select id="ds-status" name="status" defaultValue={dataset?.status ?? "available"}>
              <option value="available">Available</option>
              <option value="partial">Available, differs from the paper</option>
              <option value="unavailable">Not available</option>
            </Select>
          </Field>
          <Field label="Version or identifier" htmlFor="ds-version"><Input id="ds-version" name="version" defaultValue={dataset?.version ?? ""} placeholder="hash, release, DOI" /></Field>
        </div>
        <Field label="Where to get it" htmlFor="ds-url"><Input id="ds-url" name="url" type="url" defaultValue={dataset?.url ?? ""} /></Field>
        <Field label="Notes" htmlFor="ds-note"><Textarea id="ds-note" name="note" defaultValue={dataset?.note ?? ""} rows={2} /></Field>
        <div>
          <p className="label">Source papers</p>
          {sources.map((s, i) => (
            <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[130px_1fr_110px_70px_auto]">
              <Input aria-label="Relation" value={s.relation} placeholder="split from" onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, relation: e.target.value } : x)))} />
              <Input aria-label="Paper title" value={s.title} placeholder="Paper title" onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <Input aria-label="arXiv ID" value={s.arxiv_id ?? ""} placeholder="arXiv ID" className="mono !text-[12px]" onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, arxiv_id: e.target.value || null } : x)))} />
              <Input aria-label="Year" value={s.year ?? ""} placeholder="Year" inputMode="numeric" onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, year: e.target.value ? Number(e.target.value) : null } : x)))} />
              <Button variant="ghost" size="icon" type="button" aria-label="Remove source" onClick={() => setSources(sources.filter((_, j) => j !== i))}><Trash2 /></Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" type="button" onClick={() => setSources([...sources, { relation: "introduced in", title: "" }])}><Plus /> Add source paper</Button>
        </div>
        <div className="flex justify-end"><Button type="submit" loading={busy}>Save dataset</Button></div>
      </form>
    </Dialog>
  );
}

export function DatasetList({ projectId, datasets, canEdit }: { projectId: string; datasets: Dataset[]; canEdit: boolean }) {
  const submit = useSubmit();
  return (
    <div className="space-y-3">
      {datasets.length === 0 && <p className="sheet px-5 py-4 text-sm text-ink-2">No datasets recorded.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {datasets.map((d) => (
          <div key={d.id} className="sheet p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="title text-lg">{d.name}</h3>
                <p className="mono text-[11px] text-ink-3">{d.key}{d.version ? ` · ${d.version}` : ""}</p>
              </div>
              <StatusBadge status={d.status === "available" ? "completed" : d.status === "partial" ? "partial" : "blocked"} label={d.status === "available" ? "available" : d.status === "partial" ? "differs" : "not available"} />
            </div>
            {d.sources.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-ink-2">
                {d.sources.map((s, i) => <li key={i}><span className="mono text-[10.5px] uppercase tracking-[0.06em] text-ink-3">{s.relation}</span> {s.arxiv_id ? <a href={`https://arxiv.org/abs/${s.arxiv_id}`} target="_blank" rel="noreferrer">{s.title}</a> : s.title}{s.year ? ` (${s.year})` : ""}</li>)}
              </ul>
            )}
            {d.note && <p className="mt-3 border-t border-line pt-3 text-xs text-ink-3">{d.note}</p>}
            {canEdit && (
              <div className="mt-3 flex gap-1">
                <DatasetDialog projectId={projectId} dataset={d} trigger={<Button variant="ghost" size="sm">Edit</Button>} />
                <ConfirmButton label="Delete" title={`Delete ${d.name}?`} description="Published results that point at this dataset are unlinked from it." onConfirm={async () => { await submit(() => api(`/api/v1/projects/${projectId}/datasets/${d.id}`, { method: "DELETE" }), "Dataset deleted"); }} />
              </div>
            )}
          </div>
        ))}
      </div>
      {canEdit && <DatasetDialog projectId={projectId} trigger={<Button variant="secondary" size="sm"><Plus /> Add dataset</Button>} />}
    </div>
  );
}

type Deviation = { id: string; key: string; kind: string; what: string; why: string | null; expected_effect: string | null; applies_to: string | null };

export function DeviationList({ projectId, deviations, canEdit }: { projectId: string; deviations: Deviation[]; canEdit: boolean }) {
  const submit = useSubmit();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      {deviations.length === 0 ? (
        <p className="sheet px-5 py-4 text-sm text-ink-2">No deviations logged. Record any change you make relative to the original: a different package version, an edited line of code, a different split.</p>
      ) : (
        <ol className="sheet divide-y divide-line">
          {deviations.map((d) => (
            <li key={d.id} className="grid gap-3 p-5 sm:grid-cols-[60px_1fr_1fr_auto] sm:gap-5">
              <div><div className="mono text-sm font-medium">{d.key}</div><div className="mono mt-1 text-[10px] uppercase tracking-[0.08em] text-ink-3">{d.kind}</div></div>
              <div><p className="text-[15px]">{d.what}</p>{d.applies_to && <p className="mt-1 text-xs text-ink-3">Applies to {d.applies_to}</p>}</div>
              <dl className="space-y-2 text-sm"><div><dt className="label !mb-0.5">Why</dt><dd className="text-ink-2">{d.why ?? "–"}</dd></div><div><dt className="label !mb-0.5">Expected effect</dt><dd className="text-ink-2">{d.expected_effect ?? "–"}</dd></div></dl>
              {canEdit && <ConfirmButton label="" icon={<Trash2 />} title={`Delete ${d.key}?`} description="The deviation is removed from the record." onConfirm={async () => { await submit(() => api(`/api/v1/projects/${projectId}/deviations/${d.id}`, { method: "DELETE" }), "Deviation deleted"); }} />}
            </li>
          ))}
        </ol>
      )}
      {canEdit && (
        <Dialog open={open} onOpenChange={setOpen} title="Log a deviation" description="Anything done differently from the original method." trigger={<Button variant="secondary" size="sm"><Plus /> Log a deviation</Button>}>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              const ok = await submit(() => api(`/api/v1/projects/${projectId}/deviations`, { method: "POST", json: Object.fromEntries(f) }), "Deviation logged");
              setBusy(false);
              if (ok) setOpen(false);
            }}
          >
            <Field label="Type" htmlFor="dv-kind"><Select id="dv-kind" name="kind" defaultValue="environment"><option value="environment">Environment</option><option value="code">Code</option><option value="data">Data</option><option value="protocol">Protocol</option></Select></Field>
            <Field label="What changed" htmlFor="dv-what"><Textarea id="dv-what" name="what" required rows={2} /></Field>
            <Field label="Why" htmlFor="dv-why"><Input id="dv-why" name="why" /></Field>
            <Field label="Expected effect on results" htmlFor="dv-effect"><Input id="dv-effect" name="expected_effect" /></Field>
            <Field label="Applies to" htmlFor="dv-applies" hint="e.g. all runs, run group cora"><Input id="dv-applies" name="applies_to" /></Field>
            <div className="flex justify-end"><Button type="submit" loading={busy}>Log deviation</Button></div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
