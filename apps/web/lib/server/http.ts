import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { currentUser, type SessionUser } from "./auth";

/** Errors with a stable code, a safe message, and an HTTP status. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new ApiError(404, "not_found", `${what} not found`);
export const forbidden = (msg = "You do not have permission to do that") => new ApiError(403, "forbidden", msg);

export function ok(data: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(data, { status, headers });
}

function fromPg(err: { code?: string; message?: string; constraint?: string }): ApiError | null {
  switch (err.code) {
    case "23505":
      return new ApiError(409, "conflict", "That already exists", { constraint: err.constraint });
    case "23503":
      return new ApiError(422, "invalid_reference", "A referenced record does not exist");
    case "23514":
    case "22P02":
    case "22023":
      return new ApiError(422, "invalid_value", "A value is not allowed");
    case "42501":
      // Row Level Security or a missing grant: treat as not found so we do not reveal
      // whether another user's record exists. Log the cause for operators.
      console.warn("[api] permission denied:", err.message);
      return notFound();
    default:
      return null;
  }
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "validation_failed", message: "Some fields are not valid", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } },
      { status: 422 },
    );
  }
  const pgErr = fromPg(err as { code?: string });
  if (pgErr) return errorResponse(pgErr);
  console.error("[api] unhandled error", err);
  return NextResponse.json({ error: { code: "internal", message: "Something went wrong" } }, { status: 500 });
}

type Ctx<P> = { params: Promise<P> };

/** Route handler for signed-in users. */
export function userRoute<P = Record<string, never>>(fn: (req: Request, user: SessionUser, params: P) => Promise<Response>) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const user = await currentUser();
      if (!user) throw new ApiError(401, "unauthenticated", "Sign in first");
      return await fn(req, user, await ctx.params);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Route handler with no session requirement (SDK ingestion authenticates itself). */
export function publicRoute<P = Record<string, never>>(fn: (req: Request, params: P) => Promise<Response>) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      return await fn(req, await ctx.params);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Parse a JSON body with a size cap, before schema validation. */
export async function readJson(req: Request, maxBytes = 256 * 1024): Promise<unknown> {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new ApiError(413, "payload_too_large", `Request body is larger than ${maxBytes} bytes`);
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError(413, "payload_too_large", `Request body is larger than ${maxBytes} bytes`);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "Request body is not valid JSON");
  }
}

export function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function requireUuid(s: string, what = "Resource") {
  if (!isUuid(s)) throw notFound(what);
  return s;
}

/** Fixed-window limiter, per server instance. On serverless hosts each instance keeps
 * its own counts, so treat this as a brake, not a guarantee. */
const buckets = new Map<string, { start: number; count: number }>();
export function rateLimit(key: string, max: number, windowMs = 60_000) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start > windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return;
  }
  b.count++;
  if (b.count > max) throw new ApiError(429, "rate_limited", "Too many requests; try again shortly");
  if (buckets.size > 10_000) buckets.clear();
}
