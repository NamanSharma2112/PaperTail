import "server-only";
import pg from "pg";
// @ts-expect-error -- plain ESM helper shared with the migration script
import { poolConfig } from "../../scripts/pg-config.mjs";

// One pool per server process (reused across hot reloads in development).
const globalForPool = globalThis as unknown as { __ptPool?: pg.Pool };

export function pool(): pg.Pool {
  if (!globalForPool.__ptPool) {
    globalForPool.__ptPool = new pg.Pool(poolConfig(process.env.DATABASE_URL, { max: Number(process.env.DATABASE_POOL_MAX ?? 5) }));
  }
  return globalForPool.__ptPool;
}

export type Db = pg.PoolClient;

/**
 * Run fn in a transaction as the signed-in user. The transaction switches to the
 * restricted papertrail_app role and sets app.user_id, so Row Level Security decides
 * what the queries can see and change.
 */
export async function withUser<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  if (!userId) throw new Error("withUser needs a user id");
  const client = await pool().connect();
  try {
    await client.query("begin");
    await client.query("set local role papertrail_app");
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run fn in a transaction as the database owner, bypassing Row Level Security. Only for
 * paths that have already authorised the caller another way: SDK ingestion after the
 * ingestion token is verified, and profile creation at sign-up.
 */
export async function withSystem<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
