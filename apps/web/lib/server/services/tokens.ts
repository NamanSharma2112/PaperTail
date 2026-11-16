import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "../db";
import { ApiError } from "../http";
import { logActivity, maybeOne, one, projectRole, rows } from "./common";

/**
 * Project-scoped ingestion tokens for the Python SDK.
 * Format: pt_<43 chars base64url> (256 bits of randomness). Only the SHA-256 hash is
 * stored; the token itself is returned once, at creation.
 */
export function newToken() {
  const token = `pt_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashToken(token), prefix: token.slice(0, 10) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function listTokens(db: Db, projectId: string) {
  const role = await projectRole(db, projectId);
  if (role === "viewer") throw new ApiError(403, "forbidden", "Viewers cannot see ingestion tokens");
  return rows(db, "select id, name, token_prefix, expires_at, revoked_at, last_used_at, created_at from ingestion_tokens where project_id = $1 order by created_at desc", [projectId]);
}

export async function createToken(db: Db, userId: string, projectId: string, input: { name: string; expires_in_days?: number | null }) {
  const role = await projectRole(db, projectId);
  if (role === "viewer") throw new ApiError(403, "forbidden", "Viewers cannot create ingestion tokens");
  const t = newToken();
  const expires = input.expires_in_days ? new Date(Date.now() + input.expires_in_days * 86400_000).toISOString() : null;
  const row = await one<{ id: string; name: string; token_prefix: string; expires_at: string | null; created_at: string }>(
    db,
    "insert into ingestion_tokens (project_id, created_by, name, token_hash, token_prefix, expires_at) values ($1,$2,$3,$4,$5,$6) returning id, name, token_prefix, expires_at, created_at",
    [projectId, userId, input.name, t.hash, t.prefix, expires],
  );
  await logActivity(db, projectId, userId, "token.created", `Created ingestion token "${input.name}"`);
  return { ...row, token: t.token };
}

export async function revokeToken(db: Db, userId: string, projectId: string, tokenId: string) {
  const role = await projectRole(db, projectId);
  if (role === "viewer") throw new ApiError(403, "forbidden", "Viewers cannot revoke tokens");
  const r = await maybeOne<{ name: string }>(db, "update ingestion_tokens set revoked_at = now() where id = $1 and project_id = $2 and revoked_at is null returning name", [tokenId, projectId]);
  if (!r) throw new ApiError(404, "not_found", "Token not found or already revoked");
  await logActivity(db, projectId, userId, "token.revoked", `Revoked ingestion token "${r.name}"`);
}

export type VerifiedToken = { id: string; project_id: string; created_by: string | null };

/** Owner-role lookup (the app role cannot read hashes). Returns null for unknown,
 * revoked or expired tokens. */
export async function verifyToken(db: Db, raw: string | null): Promise<VerifiedToken | null> {
  if (!raw || !/^pt_[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const row = await maybeOne<VerifiedToken>(
    db,
    `update ingestion_tokens set last_used_at = now()
      where token_hash = $1 and revoked_at is null and (expires_at is null or expires_at > now())
      returning id, project_id, created_by`,
    [hashToken(raw)],
  );
  return row;
}
