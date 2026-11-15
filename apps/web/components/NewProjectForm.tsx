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
    <div className="sheet p-6 sm:p-8">
      <div className="grid gap-6 md:grid-cols-[1fr_1.3fr] md:items-end">
        <div>
          <p className="eyebrow">New record</p>
          <h3 className="title mt-2 text-2xl">Start with the paper</h3>
          <p className="mt-2 text-sm text-ink-2">
            Paste an arXiv identifier or a DOI. The title, authors and links are filled in for you; you add the numbers you want to check.
          </p>
        </div>
        <form onSubmit={submit}>
          <label className="label" htmlFor="identifier">
            arXiv ID or DOI
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="identifier"
              className="field mono !text-[13px]"
              placeholder="1609.02907"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoComplete="off"
              spellCheck={false}
            />
            <button className="btn shrink-0" disabled={busy || !identifier.trim()}>
              {busy ? "Importing…" : "Import paper →"}
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            Try <button type="button" className="mono text-accent hover:underline" onClick={() => setIdentifier("1706.03762")}>1706.03762</button> or{" "}
            <button type="button" className="mono text-accent hover:underline" onClick={() => setIdentifier("10.48550/arXiv.1412.6980")}>10.48550/arXiv.1412.6980</button>
          </p>
        </form>
      </div>
      {error && (
        <p role="alert" className="panel-in mt-4 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span aria-hidden style={{ color: "var(--critical)" }}>✕ </span>
          {error}
        </p>
      )}
      {created && (
        <div className="panel-in mt-5 rounded-xl border border-line bg-surface-2 p-4 text-sm">
          <p>
            <span aria-hidden style={{ color: "var(--good)" }}>✓ </span>
            Created <Link href={`/projects/${created.slug}`}>{created.title}</Link>
          </p>
          <p className="label mt-3">Project token · shown once</p>
          <code className="mono block break-all rounded-lg border border-line bg-surface px-3 py-2 text-xs">{created.token}</code>
          <p className="mt-2 text-xs text-ink-3">Anyone with this token can edit the project and upload runs. It is saved in this browser; keep a copy for the command line.</p>
        </div>
      )}
    </div>
  );
}
