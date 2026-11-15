"use client";

import Link from "next/link";
import { useState } from "react";

type Created = { slug: string; title: string; token: string };

export function NewProjectForm() {
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Could not import that paper.");
      try {
        window.localStorage.setItem(`papertrail-token:${body.slug}`, body.token);
      } catch {
        /* storage unavailable: the token is still shown below */
      }
      setCreated({ slug: body.slug, title: body.title, token: body.token });
      setIdentifier("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import that paper.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-base font-semibold">Start a reproduction</h2>
      <p className="mt-1 text-sm text-ink-2">Import the paper by its arXiv identifier or DOI. Title, authors and links are fetched for you.</p>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="identifier">
          arXiv identifier or DOI
        </label>
        <input
          id="identifier"
          className="field"
          placeholder="1609.02907 or 10.1371/journal.pbio.3003726"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
        <button className="btn shrink-0" disabled={busy || !identifier.trim()}>
          {busy ? "Importing…" : "Import paper"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm">
          <span aria-hidden style={{ color: "var(--critical)" }}>✕ </span>
          {error}
        </p>
      )}
      {created && (
        <div className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">
          <p>
            Created <Link href={`/projects/${created.slug}`}>{created.title}</Link>.
          </p>
          <p className="mt-2 font-semibold">Project token (shown once)</p>
          <code className="mt-1 block break-all rounded bg-surface px-2 py-1.5 font-mono text-xs">{created.token}</code>
          <p className="mt-1 text-xs text-ink-3">
            Anyone with this token can edit the project and upload runs. It has been saved in this browser; keep a copy for the command line.
          </p>
        </div>
      )}
    </div>
  );
}
