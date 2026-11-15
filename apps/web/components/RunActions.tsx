"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/utils";

export function RunNotes({ runId, notes, canEdit }: { runId: string; notes: string | null; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(notes ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <label htmlFor="run-notes" className="label">Notes</label>
      <Textarea id="run-notes" value={value} onChange={(e) => setValue(e.target.value)} disabled={!canEdit} rows={4} placeholder="What you noticed about this run." />
      {canEdit && <Button size="sm" variant="secondary" loading={busy} disabled={value === (notes ?? "")} onClick={async () => { setBusy(true); try { await api(`/api/v1/runs/${runId}`, { method: "PATCH", json: { notes: value } }); toast("success", "Notes saved"); router.refresh(); } catch (e) { toast("error", e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); } }}>Save notes</Button>}
    </div>
  );
}

export function RunControls({ projectId, runId, status }: { projectId: string; runId: string; status: string }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      {(status === "running" || status === "pending") && (
        <ConfirmButton variant="secondary" label="Mark as cancelled" title="Mark this run as cancelled?" description="Use this for runs that crashed without reporting back. It cannot be marked completed afterwards; only the SDK can complete a run." confirmLabel="Mark cancelled"
          onConfirm={async () => { await api(`/api/v1/runs/${runId}`, { method: "PATCH", json: { status: "cancelled" } }); toast("success", "Run cancelled"); router.refresh(); }} />
      )}
      <ConfirmButton variant="secondary" label="Delete run" title="Delete this run?" description="Its metrics and artifacts are deleted too. Comparisons will no longer include it."
        onConfirm={async () => { await api(`/api/v1/runs/${runId}`, { method: "DELETE" }); toast("success", "Run deleted"); router.push(`/projects/${projectId}/experiments`); router.refresh(); }} />
    </div>
  );
}
