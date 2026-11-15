"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ClaimRef = { key: string; label: string };

async function send(slug: string, token: string, method: string, path: string, body: unknown): Promise<string | null> {
  const response = await fetch(`/api/projects/${slug}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (response.ok) return null;
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) return "That token is not valid for this project.";
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail)) return data.detail.map((d: { loc: string[]; msg: string }) => `${d.loc.at(-1)}: ${d.msg}`).join("; ");
  return `The server answered ${response.status}.`;
}

function blankToNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

export function EditPanel({ slug, claims }: { slug: string; claims: ClaimRef[] }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setToken(window.localStorage.getItem(`papertrail-token:${slug}`) ?? "");
    } catch {
      /* storage unavailable */
    }
  }, [slug]);

  function remember(value: string) {
    setToken(value);
    try {
      window.localStorage.setItem(`papertrail-token:${slug}`, value);
    } catch {
      /* storage unavailable */
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>, method: string, path: (f: FormData) => string, build: (f: FormData) => unknown, done: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage(null);
    const error = await send(slug, token, method, path(data), build(data));
    setBusy(false);
    if (error) {
      setMessage({ ok: false, text: error });
      return;
    }
    setMessage({ ok: true, text: done });
    form.reset();
    router.refresh();
  }

  const disabled = busy || !token.trim();

  return (
    <details className="sheet p-6">
      <summary className="cursor-pointer text-[15px] font-medium">Add claims, deviations and conclusions <span className="text-ink-3">(needs the project token)</span></summary>
      <div className="mt-4">
        <label className="label" htmlFor="token">
          Project token
        </label>
        <input id="token" type="password" className="field max-w-md" value={token} onChange={(e) => remember(e.target.value)} placeholder="pt_…" autoComplete="off" />
        <p className="mt-1 text-xs text-ink-3">Shown once when the project was created. Kept in this browser only.</p>
      </div>

      {message && (
        <p role="status" className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span aria-hidden style={{ color: message.ok ? "var(--good)" : "var(--critical)" }}>
            {message.ok ? "✓ " : "✕ "}
          </span>
          {message.text}
        </p>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <form
          className="space-y-3"
          onSubmit={(e) =>
            submit(
              e,
              "POST",
              () => "/claims",
              (f) => ({
                key: String(f.get("key")).trim(),
                label: String(f.get("label")).trim(),
                metric: String(f.get("metric")).trim(),
                unit: blankToNull(f.get("unit")),
                reported_value: Number(f.get("reported_value")),
                aggregation: blankToNull(f.get("aggregation")),
                reported_runs: blankToNull(f.get("reported_runs")) === null ? null : Number(f.get("reported_runs")),
                source: blankToNull(f.get("source")),
                provenance: f.get("provenance"),
                tolerance: blankToNull(f.get("tolerance")) === null ? null : Number(f.get("tolerance")),
              }),
              "Claim added.",
            )
          }
        >
          <h3 className="eyebrow !text-ink-2">Add a claim</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="c-key">Short key</label>
              <input id="c-key" name="key" className="field" placeholder="table2-cora" required pattern="[A-Za-z0-9][A-Za-z0-9_.\-]*" />
            </div>
            <div>
              <label className="label" htmlFor="c-value">Reported value</label>
              <input id="c-value" name="reported_value" className="field" type="number" step="any" required />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="c-label">What the number is</label>
            <input id="c-label" name="label" className="field" placeholder="Table 2: GCN on Cora" required />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="label" htmlFor="c-metric">Metric</label>
              <input id="c-metric" name="metric" className="field" placeholder="test accuracy" required />
            </div>
            <div>
              <label className="label" htmlFor="c-unit">Unit</label>
              <input id="c-unit" name="unit" className="field" placeholder="%" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="c-agg">How the paper aggregated it, in its own words</label>
            <input id="c-agg" name="aggregation" className="field" placeholder="mean of 100 runs with random weight initializations" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label" htmlFor="c-runs">Runs aggregated</label>
              <input id="c-runs" name="reported_runs" className="field" type="number" min={1} />
            </div>
            <div>
              <label className="label" htmlFor="c-tol">Tolerance (±)</label>
              <input id="c-tol" name="tolerance" className="field" type="number" step="any" min={0} />
            </div>
            <div>
              <label className="label" htmlFor="c-prov">This value is</label>
              <select id="c-prov" name="provenance" className="field" defaultValue="reported">
                <option value="reported">stated by the authors</option>
                <option value="inferred">my inference</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="c-source">Where in the paper</label>
            <input id="c-source" name="source" className="field" placeholder="Table 2, row 'GCN (this paper)'" />
          </div>
          <button className="btn" disabled={disabled}>Add claim</button>
        </form>

        <div className="space-y-6">
          <form
            className="space-y-3"
            onSubmit={(e) =>
              submit(
                e,
                "POST",
                () => "/deviations",
                (f) => ({
                  kind: f.get("kind"),
                  what: String(f.get("what")).trim(),
                  why: blankToNull(f.get("why")),
                  expected_effect: blankToNull(f.get("expected_effect")),
                }),
                "Deviation recorded.",
              )
            }
          >
            <h3 className="eyebrow !text-ink-2">Record a deviation</h3>
            <div>
              <label className="label" htmlFor="d-kind">Type</label>
              <select id="d-kind" name="kind" className="field" defaultValue="environment">
                <option value="environment">Environment</option>
                <option value="code">Code</option>
                <option value="data">Data</option>
                <option value="protocol">Protocol</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="d-what">What you did differently</label>
              <textarea id="d-what" name="what" className="field" rows={2} required />
            </div>
            <div>
              <label className="label" htmlFor="d-why">Why</label>
              <input id="d-why" name="why" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="d-effect">Effect you expect on the result</label>
              <input id="d-effect" name="expected_effect" className="field" />
            </div>
            <button className="btn" disabled={disabled}>Record deviation</button>
          </form>

          <form
            className="space-y-3"
            onSubmit={(e) =>
              submit(
                e,
                "PATCH",
                (f) => `/claims/${encodeURIComponent(String(f.get("claim")))}`,
                (f) => ({ verdict: blankToNull(f.get("verdict")), verdict_note: blankToNull(f.get("verdict_note")) }),
                "Conclusion saved.",
              )
            }
          >
            <h3 className="eyebrow !text-ink-2">Record your conclusion</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="v-claim">Claim</label>
                <select id="v-claim" name="claim" className="field" required>
                  {claims.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="v-verdict">Conclusion</label>
                <select id="v-verdict" name="verdict" className="field" defaultValue="matched">
                  <option value="matched">Matched</option>
                  <option value="not_matched">Did not match</option>
                  <option value="inconclusive">Inconclusive</option>
                  <option value="blocked">Blocked</option>
                  <option value="">No conclusion yet</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="v-note">Reasoning</label>
              <textarea id="v-note" name="verdict_note" className="field" rows={2} />
            </div>
            <button className="btn" disabled={disabled || claims.length === 0}>Save conclusion</button>
          </form>
        </div>
      </div>
    </details>
  );
}
