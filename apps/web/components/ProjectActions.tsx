"use client";
import { Copy, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { PROJECT_OUTCOME, PROJECT_STATUS } from "@/lib/schemas";
import { api, timeAgo } from "@/lib/utils";

export function LinkPaper({ projectId, papers }: { projectId: string; papers: { id: string; title: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [paperId, setPaperId] = useState("");
  if (!papers.length) return <p className="mt-2">Import a paper in the <a href="/library">library</a> first.</p>;
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <label htmlFor="link-paper" className="sr-only">Paper</label>
      <Select id="link-paper" value={paperId} onChange={(e) => setPaperId(e.target.value)}>
        <option value="">Choose a paper from your library</option>
        {papers.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
      </Select>
      <Button
        disabled={!paperId}
        onClick={async () => {
          try {
            await api(`/api/v1/projects/${projectId}/papers`, { method: "POST", json: { paper_id: paperId } });
            toast("success", "Paper linked");
            router.refresh();
          } catch (e) {
            toast("error", e instanceof Error ? e.message : "Could not link");
          }
        }}
      >
        Link paper
      </Button>
    </div>
  );
}

const OUTCOME_LABEL: Record<string, string> = { successful: "Reproduced", partial: "Partially reproduced", blocked: "Blocked", inconclusive: "Inconclusive", not_reproduced: "Not reproduced" };
const STATUS_LABEL: Record<string, string> = { planning: "Planning", in_progress: "In progress", completed: "Completed", blocked: "Blocked", archived: "Archived" };

export function ProjectSettingsForm({ project, canEdit }: { project: { id: string; title: string; description: string | null; kind: string; status: string; outcome: string | null; outcome_notes: string | null; limitations: string | null; code_url: string | null; code_commit: string | null }; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        try {
          await api(`/api/v1/projects/${project.id}`, {
            method: "PATCH",
            json: {
              title: f.get("title"),
              description: f.get("description"),
              kind: f.get("kind"),
              status: f.get("status"),
              outcome: f.get("outcome") || null,
              outcome_notes: f.get("outcome_notes"),
              limitations: f.get("limitations"),
              code_url: f.get("code_url"),
              code_commit: f.get("code_commit"),
            },
          });
          toast("success", "Project saved");
          router.refresh();
        } catch (err) {
          toast("error", err instanceof Error ? err.message : "Could not save");
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={!canEdit} className="space-y-5">
        <Field label="Title" htmlFor="ps-title"><Input id="ps-title" name="title" defaultValue={project.title} required maxLength={300} /></Field>
        <Field label="Description" htmlFor="ps-desc"><Textarea id="ps-desc" name="description" defaultValue={project.description ?? ""} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind of work" htmlFor="ps-kind">
            <Select id="ps-kind" name="kind" defaultValue={project.kind}>
              <option value="computational_reproduction">Computational reproduction</option>
              <option value="reimplementation">Reimplementation</option>
              <option value="replication">Independent replication</option>
            </Select>
          </Field>
          <Field label="Project status" htmlFor="ps-status">
            <Select id="ps-status" name="status" defaultValue={project.status}>{PROJECT_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <Field label="Code repository" htmlFor="ps-code"><Input id="ps-code" name="code_url" type="url" defaultValue={project.code_url ?? ""} /></Field>
          <Field label="Commit" htmlFor="ps-commit"><Input id="ps-commit" name="code_commit" className="mono !text-[13px]" defaultValue={project.code_commit ?? ""} /></Field>
        </div>
        <div className="rounded-xl border border-line bg-surface-2 p-4">
          <p className="label">Your conclusion</p>
          <p className="mb-3 text-xs text-ink-3">PaperTrail never decides this for you. It appears at the top of the report.</p>
          <Field label="Outcome" htmlFor="ps-outcome">
            <Select id="ps-outcome" name="outcome" defaultValue={project.outcome ?? ""}>
              <option value="">Not decided yet</option>
              {PROJECT_OUTCOME.map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
            </Select>
          </Field>
          <Field label="Reasoning" htmlFor="ps-on" className="mt-3"><Textarea id="ps-on" name="outcome_notes" defaultValue={project.outcome_notes ?? ""} /></Field>
          <Field label="Known limitations" htmlFor="ps-lim" className="mt-3"><Textarea id="ps-lim" name="limitations" defaultValue={project.limitations ?? ""} placeholder="Different hardware, fewer runs than the paper, missing data…" /></Field>
        </div>
      </fieldset>
      {canEdit && <Button type="submit" loading={busy}>Save project</Button>}
    </form>
  );
}

type Token = { id: string; name: string; token_prefix: string; expires_at: string | null; revoked_at: string | null; last_used_at: string | null; created_at: string };

export function TokenManager({ projectId, tokens, appUrl }: { projectId: string; tokens: Token[]; appUrl: string }) {
  const router = useRouter();
  const toast = useToast();
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const snippet = `export PAPERTRAIL_URL=${appUrl}\nexport PAPERTRAIL_PROJECT=${projectId}\nexport PAPERTRAIL_TOKEN=${created ?? "<token>"}`;
  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            const r = await api<{ token: string }>(`/api/v1/projects/${projectId}/tokens`, { method: "POST", json: { name: f.get("name") || "token", expires_in_days: f.get("expires") ? Number(f.get("expires")) : null } });
            setCreated(r.token);
            router.refresh();
          } catch (err) {
            toast("error", err instanceof Error ? err.message : "Could not create token");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Token name" htmlFor="tk-name" className="flex-1"><Input id="tk-name" name="name" placeholder="laptop, lab-gpu-1" maxLength={80} /></Field>
        <Field label="Expires" htmlFor="tk-exp">
          <Select id="tk-exp" name="expires" defaultValue="90"><option value="30">in 30 days</option><option value="90">in 90 days</option><option value="365">in a year</option><option value="">never</option></Select>
        </Field>
        <Button type="submit" loading={busy}><KeyRound /> Create token</Button>
      </form>
      {created && (
        <div className="panel-in rounded-xl border border-line bg-surface-2 p-4">
          <p className="text-sm font-medium">Copy this token now. It is shown once and stored only as a hash.</p>
          <pre className="mono mt-3 overflow-x-auto rounded-lg bg-[#0f1b2d] p-4 text-[12px] leading-relaxed text-[#e8ebf2]">{snippet}</pre>
          <Button variant="secondary" size="sm" className="mt-3" onClick={async () => { await navigator.clipboard.writeText(snippet); toast("success", "Copied"); }}><Copy /> Copy</Button>
        </div>
      )}
      {tokens.length === 0 ? (
        <p className="text-sm text-ink-3">No tokens yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="mono border-b border-line text-left text-[10.5px] uppercase tracking-[0.06em] text-ink-3"><th className="py-2 pr-3 font-medium">Name</th><th className="py-2 pr-3 font-medium">Prefix</th><th className="py-2 pr-3 font-medium">Last used</th><th className="py-2 pr-3 font-medium">Status</th><th /></tr></thead>
            <tbody>
              {tokens.map((t) => {
                const expired = t.expires_at && new Date(t.expires_at) < new Date();
                return (
                  <tr key={t.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3">{t.name}</td>
                    <td className="mono py-2 pr-3 text-xs">{t.token_prefix}…</td>
                    <td className="py-2 pr-3 text-ink-2">{t.last_used_at ? timeAgo(t.last_used_at) : "never"}</td>
                    <td className="py-2 pr-3">{t.revoked_at ? <StatusBadge status="cancelled" label="revoked" /> : expired ? <StatusBadge status="cancelled" label="expired" /> : <StatusBadge status="completed" label={t.expires_at ? `active until ${t.expires_at.slice(0, 10)}` : "active"} />}</td>
                    <td className="py-2 text-right">
                      {!t.revoked_at && (
                        <ConfirmButton label="Revoke" title={`Revoke “${t.name}”?`} description="Anything still using this token will be refused immediately. This cannot be undone." confirmLabel="Revoke"
                          onConfirm={async () => { await api(`/api/v1/projects/${projectId}/tokens/${t.id}`, { method: "DELETE" }); toast("success", "Token revoked"); router.refresh(); }} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function DeleteProject({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  return (
    <ConfirmButton
      variant="danger"
      size="md"
      label="Delete project"
      title="Delete this project?"
      description={<>“{title}”, its protocol, runs, metrics, artifacts, published results, discrepancies and tokens will be deleted permanently. Papers stay in your library.</>}
      confirmLabel="Delete permanently"
      onConfirm={async () => {
        await api(`/api/v1/projects/${id}`, { method: "DELETE" });
        router.push("/projects");
        router.refresh();
      }}
    />
  );
}
