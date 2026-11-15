"use client";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { PROVENANCE, PROVENANCE_LABEL } from "@/lib/schemas";
import { api, cn } from "@/lib/utils";

type Evidence = { source: (typeof PROVENANCE)[number]; note?: string | null; link?: string | null };
export type Protocol = {
  version: number;
  research_objective: string | null;
  hypothesis: string | null;
  methodology: string | null;
  model_information: string | null;
  dataset_information: string | null;
  preprocessing: string | null;
  training_procedure: string | null;
  evaluation_method: string | null;
  assumptions: string | null;
  experimental_setup: { hyperparameters?: Record<string, string | number | boolean>; seeds?: string | null; splits?: string | null; hardware?: string | null; frameworks?: string | null };
  evidence: Record<string, Evidence>;
  updated_at?: string;
};

const PROV_TONE: Record<string, string> = {
  reported: "bg-[color-mix(in_oklab,var(--good)_14%,transparent)]",
  implementation: "bg-[color-mix(in_oklab,var(--series-1)_14%,transparent)]",
  inferred: "bg-[color-mix(in_oklab,var(--warning)_18%,transparent)]",
  selected: "bg-[color-mix(in_oklab,var(--series-2)_14%,transparent)]",
  unknown: "bg-surface-3",
};

function ProvenancePicker({ value, onChange, disabled, id }: { value?: Evidence; onChange: (e: Evidence | null) => void; disabled?: boolean; id: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="mono text-[10.5px] uppercase tracking-[0.06em] text-ink-3">Source</label>
      <select
        id={id}
        disabled={disabled}
        value={value?.source ?? ""}
        onChange={(e) => onChange(e.target.value ? { ...(value ?? {}), source: e.target.value as Evidence["source"] } : null)}
        className={cn("rounded-full border border-line px-2.5 py-1 text-xs text-ink", value ? PROV_TONE[value.source] : "bg-surface")}
      >
        <option value="">Not classified</option>
        {PROVENANCE.map((p) => <option key={p} value={p}>{PROVENANCE_LABEL[p]}</option>)}
      </select>
      {value && (
        <input
          disabled={disabled}
          aria-label="Evidence note or location in the paper"
          placeholder="Where? e.g. Section 5.2, train.py line 98"
          value={value.note ?? ""}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          className="min-w-0 flex-1 rounded-full border border-line bg-surface px-3 py-1 text-xs"
        />
      )}
    </div>
  );
}

const METHOD_FIELDS: { key: keyof Protocol; label: string; help: string }[] = [
  { key: "research_objective", label: "Research objective", help: "What is the original paper trying to demonstrate?" },
  { key: "hypothesis", label: "Hypothesis", help: "Which result or behaviour are you checking?" },
  { key: "methodology", label: "Methodology", help: "The approach as the paper describes it." },
  { key: "model_information", label: "Model architecture", help: "Layers, sizes, variants." },
  { key: "dataset_information", label: "Datasets and preparation", help: "Which data, which version, how it was obtained." },
  { key: "preprocessing", label: "Preprocessing", help: "Normalisation, filtering, feature construction, split procedure." },
  { key: "training_procedure", label: "Training procedure", help: "Optimiser, schedule, stopping rule, number of runs." },
  { key: "evaluation_method", label: "Evaluation", help: "Metrics, test set, how results are aggregated." },
];

export function ProtocolEditor({ projectId, initial, canEdit, section }: { projectId: string; initial: Protocol; canEdit: boolean; section: "methodology" | "setup" }) {
  const router = useRouter();
  const toast = useToast();
  const [p, setP] = useState<Protocol>({ ...initial, experimental_setup: { hyperparameters: {}, ...initial.experimental_setup } });
  const [hp, setHp] = useState<{ name: string; value: string }[]>(Object.entries(initial.experimental_setup?.hyperparameters ?? {}).map(([name, value]) => ({ name, value: String(value) })));
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [dirty, setDirty] = useState(false);

  const set = (patch: Partial<Protocol>) => { setP((x) => ({ ...x, ...patch })); setDirty(true); };
  const setEvidence = (key: string, e: Evidence | null) => {
    setP((x) => {
      const ev = { ...x.evidence };
      if (e) ev[key] = e;
      else delete ev[key];
      return { ...x, evidence: ev };
    });
    setDirty(true);
  };
  const setup = p.experimental_setup;

  async function save() {
    setBusy(true);
    try {
      const hyperparameters: Record<string, string | number | boolean> = {};
      for (const r of hp) {
        const name = r.name.trim();
        if (!name) continue;
        const v = r.value.trim();
        hyperparameters[name] = v === "true" ? true : v === "false" ? false : v !== "" && !Number.isNaN(Number(v)) ? Number(v) : v;
      }
      const payload = {
        ...Object.fromEntries(METHOD_FIELDS.map((f) => [f.key, p[f.key] ?? null])),
        assumptions: p.assumptions,
        experimental_setup: { hyperparameters, seeds: setup.seeds ?? null, splits: setup.splits ?? null, hardware: setup.hardware ?? null, frameworks: setup.frameworks ?? null },
        evidence: p.evidence,
        version: p.version,
      };
      const saved = await api<Protocol>(`/api/v1/projects/${projectId}/protocol`, { method: "PUT", json: payload });
      setP((x) => ({ ...x, version: saved.version }));
      setDirty(false);
      toast("success", `Protocol saved (version ${saved.version})`);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save";
      if (/saved the protocol after you opened it/.test(msg)) setConflict(true);
      toast("error", msg);
    } finally {
      setBusy(false);
    }
  }

  const footer = canEdit && (
    <div className="sticky bottom-4 z-10 mt-8 flex flex-wrap items-center gap-3 rounded-full border border-line bg-surface/95 px-4 py-2.5 shadow-float backdrop-blur">
      <span className="mono text-xs text-ink-3">version {p.version}</span>
      <span className="text-xs text-ink-2">{conflict ? "Someone else saved a newer version." : dirty ? "Unsaved changes" : "All changes saved"}</span>
      <span className="ml-auto flex gap-2">
        {conflict && <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>Reload latest</Button>}
        <Button size="sm" onClick={save} loading={busy} disabled={!dirty || conflict}>Save protocol</Button>
      </span>
    </div>
  );

  if (section === "methodology") {
    return (
      <div className="space-y-6">
        {METHOD_FIELDS.map((f) => (
          <div key={f.key} className="sheet space-y-2.5 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label htmlFor={`f-${f.key}`} className="title text-[17px]">{f.label}</label>
              <span className="text-xs text-ink-3">{f.help}</span>
            </div>
            <Textarea id={`f-${f.key}`} disabled={!canEdit} value={(p[f.key] as string | null) ?? ""} onChange={(e) => set({ [f.key]: e.target.value } as Partial<Protocol>)} rows={3} />
            <ProvenancePicker id={`prov-${f.key}`} disabled={!canEdit} value={p.evidence[f.key]} onChange={(e) => setEvidence(f.key, e)} />
          </div>
        ))}
        {footer}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="sheet p-5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="title text-[17px]">Hyperparameters</h3>
          <span className="text-xs text-ink-3">Mark each value&apos;s source: the paper, the official code, or your choice.</span>
        </div>
        {hp.length === 0 && <p className="mb-3 text-sm text-ink-3">None yet.</p>}
        <div className="space-y-2">
          {hp.map((r, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1fr_auto]">
              <Input aria-label="Hyperparameter name" placeholder="learning_rate" className="mono !text-[13px]" disabled={!canEdit} value={r.name} onChange={(e) => { const n = [...hp]; const old = n[i].name; n[i] = { ...r, name: e.target.value }; setHp(n); if (p.evidence[`hp:${old}`]) { const ev = p.evidence[`hp:${old}`]; setEvidence(`hp:${old}`, null); setEvidence(`hp:${e.target.value}`, ev); } setDirty(true); }} />
              <Input aria-label="Value" placeholder="0.01" className="mono !text-[13px]" disabled={!canEdit} value={r.value} onChange={(e) => { const n = [...hp]; n[i] = { ...r, value: e.target.value }; setHp(n); setDirty(true); }} />
              {canEdit && <Button variant="ghost" size="icon" aria-label={`Remove ${r.name || "row"}`} onClick={() => { setHp(hp.filter((_, j) => j !== i)); setEvidence(`hp:${r.name}`, null); }}><Trash2 /></Button>}
              <div className="sm:col-span-3"><ProvenancePicker id={`prov-hp-${i}`} disabled={!canEdit || !r.name} value={p.evidence[`hp:${r.name}`]} onChange={(e) => setEvidence(`hp:${r.name}`, e)} /></div>
            </div>
          ))}
        </div>
        {canEdit && <Button variant="secondary" size="sm" className="mt-3" onClick={() => { setHp([...hp, { name: "", value: "" }]); setDirty(true); }}><Plus /> Add hyperparameter</Button>}
      </div>
      {([
        ["seeds", "Random seeds", "How many seeds, which values, and what they control."],
        ["splits", "Dataset splits", "Train / validation / test sizes and how they were drawn."],
        ["hardware", "Hardware", "What the paper used and what you are using."],
        ["frameworks", "Frameworks and dependencies", "Versions stated by the paper or pinned by the code."],
      ] as const).map(([k, label, help]) => (
        <div key={k} className="sheet space-y-2.5 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><label htmlFor={`s-${k}`} className="title text-[17px]">{label}</label><span className="text-xs text-ink-3">{help}</span></div>
          <Textarea id={`s-${k}`} rows={2} disabled={!canEdit} value={setup[k] ?? ""} onChange={(e) => set({ experimental_setup: { ...setup, [k]: e.target.value } })} />
          <ProvenancePicker id={`prov-${k}`} disabled={!canEdit} value={p.evidence[k]} onChange={(e) => setEvidence(k, e)} />
        </div>
      ))}
      <div className="sheet space-y-2.5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><label htmlFor="f-assumptions" className="title text-[17px]">Assumptions</label><span className="text-xs text-ink-3">Decisions you made where the paper is silent.</span></div>
        <Textarea id="f-assumptions" rows={3} disabled={!canEdit} value={p.assumptions ?? ""} onChange={(e) => set({ assumptions: e.target.value })} />
      </div>
      {footer}
    </div>
  );
}
