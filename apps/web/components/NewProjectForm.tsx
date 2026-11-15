"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { api } from "@/lib/utils";

export function NewProjectForm({ papers, preselect }: { papers: { id: string; title: string; publication_year: number | null }[]; preselect?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initial = papers.find((p) => p.id === preselect);
  const [title, setTitle] = useState(initial ? `Reproducing: ${initial.title}`.slice(0, 300) : "");
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        try {
          const p = await api<{ id: string }>("/api/v1/projects", {
            method: "POST",
            json: {
              title,
              description: f.get("description"),
              paper_id: f.get("paper_id") || null,
              kind: f.get("kind"),
              code_url: f.get("code_url"),
              code_commit: f.get("code_commit"),
            },
          });
          router.push(`/projects/${p.id}`);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not create the project");
          setBusy(false);
        }
      }}
    >
      {error && <p role="alert" className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-[var(--critical)]">{error}</p>}
      <Field label="Paper" htmlFor="paper_id" hint={papers.length ? "The paper whose results you are reproducing." : "Your library is empty; you can link a paper later from the project."}>
        <Select
          id="paper_id"
          name="paper_id"
          defaultValue={preselect ?? ""}
          onChange={(e) => {
            const p = papers.find((x) => x.id === e.target.value);
            if (p && !title) setTitle(`Reproducing: ${p.title}`.slice(0, 300));
          }}
        >
          <option value="">No paper yet</option>
          {papers.map((p) => <option key={p.id} value={p.id}>{p.title}{p.publication_year ? ` (${p.publication_year})` : ""}</option>)}
        </Select>
      </Field>
      <Field label="Project title" htmlFor="title"><Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={300} /></Field>
      <Field label="Description" htmlFor="description"><Textarea id="description" name="description" placeholder="What are you trying to check, and why?" maxLength={5000} /></Field>
      <Field label="Kind of work" htmlFor="kind" hint="Re-running the authors' code and data, writing your own implementation, or testing the claim on new data.">
        <Select id="kind" name="kind" defaultValue="computational_reproduction">
          <option value="computational_reproduction">Computational reproduction</option>
          <option value="reimplementation">Reimplementation</option>
          <option value="replication">Independent replication</option>
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <Field label="Code repository" htmlFor="code_url"><Input id="code_url" name="code_url" type="url" placeholder="https://github.com/…" /></Field>
        <Field label="Commit" htmlFor="code_commit"><Input id="code_commit" name="code_commit" className="mono !text-[13px]" maxLength={80} /></Field>
      </div>
      <Button type="submit" loading={busy}>Create project</Button>
    </form>
  );
}
