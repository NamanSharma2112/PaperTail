// Apply SQL migrations in db/migrations in order, once each, in a transaction each.
//   DATABASE_URL=... node scripts/migrate.mjs
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { poolConfig } from "./pg-config.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dir = process.env.MIGRATIONS_DIR ?? resolve(here, "../../../db/migrations");

const client = new pg.Client(poolConfig(process.env.DATABASE_URL));
await client.connect();
await client.query(`create table if not exists schema_migrations (
  version text primary key, checksum text not null, applied_at timestamptz not null default now())`);
const applied = new Map((await client.query("select version, checksum from schema_migrations")).rows.map((r) => [r.version, r.checksum]));

let count = 0;
for (const file of readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()) {
  const sql = readFileSync(join(dir, file), "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  if (applied.has(file)) {
    if (applied.get(file) !== checksum) {
      console.error(`migration ${file} was changed after it was applied; add a new migration instead`);
      process.exit(1);
    }
    continue;
  }
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into schema_migrations (version, checksum) values ($1, $2)", [file, checksum]);
    await client.query("commit");
    console.log(`applied ${file}`);
    count++;
  } catch (err) {
    await client.query("rollback");
    console.error(`failed in ${file}: ${err.message}`);
    process.exit(1);
  }
}
console.log(count ? `${count} migration(s) applied` : "database is up to date");
await client.end();
