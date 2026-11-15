"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { READING_STATUS } from "@/lib/schemas";
import { api } from "@/lib/utils";

export const READING_LABEL: Record<string, string> = { to_read: "To read", reading: "Reading", read: "Read", reproducing: "Reproducing", reproduced: "Reproduced" };

export function ImportPaper({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className={compact ? "flex flex-col gap-2 sm:flex-row" : "space-y-3"}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const r = await api<{ paper: { id: string; title: string }; existing: boolean }>("/api/v1/papers/import", { method: "POST", json: { identifier: value } });
          toast("success", r.existing ? `Already in your library: ${r.paper.title}` : `Imported: ${r.paper.title}`);
          setValue("");
          router.push(`/library/${r.paper.id}`);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Import failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="paper-identifier" className="sr-only">arXiv ID, DOI or paper URL</label>
      <Input id="paper-identifier" className="mono !text-[13px]" placeholder="arXiv ID, DOI or paper URL — e.g. 1609.02907" value={value} onChange={(e) => setValue(e.target.value)} required minLength={3} autoComplete="off" spellCheck={false} />
      <Button type="submit" loading={busy} className="shrink-0">Import paper</Button>
      {error && <p role="alert" className="text-sm text-[var(--critical)] sm:basis-full">{error}</p>}
    </form>
  );
}

export function PaperEditor({ paper }: { paper: { id: string; reading_status: string; tags: string[]; notes: string | null } }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        try {
          await api(`/api/v1/papers/${paper.id}`, {
            method: "PATCH",
            json: {
              reading_status: f.get("reading_status"),
              tags: String(f.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
              notes: String(f.get("notes") ?? ""),
            },
          });
          toast("success", "Saved");
          router.refresh();
        } catch (err) {
          toast("error", err instanceof Error ? err.message : "Could not save");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Status" htmlFor="rs">
        <Select id="rs" name="reading_status" defaultValue={paper.reading_status}>
          {READING_STATUS.map((s) => <option key={s} value={s}>{READING_LABEL[s]}</option>)}
        </Select>
      </Field>
      <Field label="Tags" htmlFor="tags" hint="Comma-separated."><Input id="tags" name="tags" defaultValue={paper.tags.join(", ")} /></Field>
      <Field label="Notes" htmlFor="notes"><Textarea id="notes" name="notes" defaultValue={paper.notes ?? ""} rows={5} /></Field>
      <Button type="submit" loading={busy}>Save</Button>
    </form>
  );
}

export function DeletePaper({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  return (
    <ConfirmButton
      label="Remove from library"
      variant="secondary"
      title="Remove this paper?"
      description={<>“{title}” will be removed from your library and unlinked from your projects. The projects themselves are kept.</>}
      confirmLabel="Remove"
      onConfirm={async () => {
        await api(`/api/v1/papers/${id}`, { method: "DELETE" });
        router.push("/library");
        router.refresh();
      }}
    />
  );
}
