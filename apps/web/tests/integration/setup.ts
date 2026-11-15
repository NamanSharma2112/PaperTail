import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import pg from "pg";

/** A fresh, migrated database for each test file. Needs TEST_DATABASE_URL pointing at a
 * database the tests may drop and recreate objects in (never a real one). */
export async function freshDatabase() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Set TEST_DATABASE_URL to run integration tests");
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query("drop schema if exists public cascade; drop schema if exists app cascade; create schema public;");
  await c.end();
  execFileSync(process.execPath, [resolve(__dirname, "../../scripts/migrate.mjs")], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  process.env.DATABASE_URL = url;
}

export async function makeUser(db: pg.PoolClient | pg.Client, id: string) {
  await db.query(`insert into "user" (id, name, email, "emailVerified") values ($1, $1, $1 || '@example.org', true)`, [id]);
  await db.query("insert into profiles (id, display_name) values ($1, $1)", [id]);
}
