import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined || Number.isNaN(value) ? "–" : value.toFixed(digits);
}

export function signed(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "–";
  const text = Math.abs(value).toFixed(digits);
  return (value < 0 && Number(text) !== 0 ? "−" : "+") + text;
}

export function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return "–";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return d.toISOString().slice(0, 10);
}

export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "–";
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
  return `${Math.floor(seconds / 3600)} h ${Math.round((seconds % 3600) / 60)} min`;
}

/** Call the app's own API from the browser; throws with the server's message. */
export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = body?.error;
    const detail = Array.isArray(e?.details) ? e.details.map((d: { path: string; message: string }) => `${d.path}: ${d.message}`).join("; ") : "";
    throw new Error([e?.message ?? `Request failed (${res.status})`, detail].filter(Boolean).join(" — "));
  }
  return body as T;
}
