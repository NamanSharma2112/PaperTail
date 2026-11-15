import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
import { freshDatabase, makeUser } from "./setup";

// Row Level Security and permission tests against a real PostgreSQL, through the same
// withUser/withSystem paths the application uses.
let db: typeof import("../../lib/server/db");
let projects: typeof import("../../lib/server/services/projects");
let tokens: typeof import("../../lib/server/services/tokens");
let records: typeof import("../../lib/server/services/records");
let runs: typeof import("../../lib/server/services/runs");
let pid = "";
let runId = "";

const denied = async (p: Promise<unknown>) => {
  try {
    await p;
    return false;
  } catch (e) {
    const err = e as { code?: string; status?: number };
    return ["42501", "23514", "P0001", "22P02"].includes(err.code ?? "") || err.status === 404 || err.status === 403 || err.status === 409;
  }
};

beforeAll(async () => {
  if (!enabled) return;
  await freshDatabase();
  db = await import("../../lib/server/db");
  projects = await import("../../lib/server/services/projects");
  tokens = await import("../../lib/server/services/tokens");
  records = await import("../../lib/server/services/records");
  runs = await import("../../lib/server/services/runs");
  await db.withSystem(async (c) => {
    for (const u of ["alice", "bob", "carol", "dave"]) await makeUser(c, u);
  });
  const p = await db.withUser("alice", (c) => projects.createProject(c, "alice", { title: "Alice's project", description: null, kind: "computational_reproduction", code_url: null, code_commit: null }));
  pid = p.id;
  await db.withSystem(async (c) => {
    runId = (await c.query("insert into experiment_runs (project_id, name, status) values ($1, 'r1', 'completed') returning id", [pid])).rows[0].id;
    await c.query("insert into run_metrics (run_id, metric_name, metric_value) values ($1, 'acc', 0.8)", [runId]);
    await c.query("insert into project_members (project_id, user_id, role) values ($1, 'carol', 'viewer'), ($1, 'dave', 'editor')", [pid]);
  });
});

afterAll(async () => {
  if (enabled) await db.pool().end();
});

describe.runIf(enabled)("isolation between users", () => {
  it("a non-member sees nothing", async () => {
    const seen = await db.withUser("bob", async (c) => ({
      projects: (await c.query("select * from projects")).rowCount,
      runs: (await c.query("select * from experiment_runs")).rowCount,
      metrics: (await c.query("select * from run_metrics")).rowCount,
      protocols: (await c.query("select * from protocols")).rowCount,
      tokens: (await c.query("select id from ingestion_tokens")).rowCount,
      activity: (await c.query("select * from activity_events")).rowCount,
      members: (await c.query("select * from project_members")).rowCount,
      profiles: (await c.query("select * from profiles")).rowCount,
    }));
    expect(seen).toEqual({ projects: 0, runs: 0, metrics: 0, protocols: 0, tokens: 0, activity: 0, members: 0, profiles: 1 });
  });
  it("a non-member cannot change or delete another user's project", async () => {
    const updated = await db.withUser("bob", async (c) => (await c.query("update projects set title = 'x' where id = $1", [pid])).rowCount);
    const deleted = await db.withUser("bob", async (c) => (await c.query("delete from projects where id = $1", [pid])).rowCount);
    expect([updated, deleted]).toEqual([0, 0]);
    expect(await denied(db.withUser("bob", (c) => projects.getProject(c, pid)))).toBe(true);
  });
  it("a non-member cannot insert into another user's project", async () => {
    expect(await denied(db.withUser("bob", (c) => c.query("insert into discrepancies (project_id, category, title) values ($1, 'other', 'x')", [pid])))).toBe(true);
    expect(await denied(db.withUser("bob", (c) => c.query("insert into project_members (project_id, user_id, role) values ($1, 'bob', 'editor')", [pid])))).toBe(true);
  });
  it("authentication tables are not readable by the application role", async () => {
    for (const t of ['"user"', "session", "account", "verification"]) expect(await denied(db.withUser("alice", (c) => c.query(`select * from ${t}`)))).toBe(true);
  });
  it("without a user id nothing is visible", async () => {
    const n = await db.withSystem(async (c) => {
      await c.query("set local role papertrail_app");
      return (await c.query("select * from projects")).rowCount;
    });
    expect(n).toBe(0);
  });
});

describe.runIf(enabled)("roles", () => {
  it("viewers read but cannot write", async () => {
    expect((await db.withUser("carol", (c) => projects.getProject(c, pid))).role).toBe("viewer");
    expect(await denied(db.withUser("carol", (c) => records.createDiscrepancy(c, "carol", pid, { category: "other", title: "x" })))).toBe(true);
    expect(await denied(db.withUser("carol", (c) => projects.updateProject(c, "carol", pid, { title: "x" })))).toBe(true);
    expect(await denied(db.withUser("carol", (c) => tokens.listTokens(c, pid)))).toBe(true);
    expect(await denied(db.withUser("carol", (c) => runs.deleteRun(c, "carol", runId)))).toBe(true);
  });
  it("editors write research data but cannot delete the project or manage members", async () => {
    const d = await db.withUser("dave", (c) => records.createDiscrepancy(c, "dave", pid, { category: "statistical_variation", title: "seen by editor" }));
    expect(d.title).toBe("seen by editor");
    expect(await denied(db.withUser("dave", (c) => projects.deleteProject(c, pid)))).toBe(true);
    const added = await denied(db.withUser("dave", (c) => c.query("insert into project_members (project_id, user_id, role) values ($1, 'bob', 'viewer')", [pid])));
    expect(added).toBe(true);
  });
  it("nobody can promote themselves to owner", async () => {
    expect(await denied(db.withUser("alice", (c) => c.query("insert into project_members (project_id, user_id, role) values ($1, 'bob', 'owner')", [pid])))).toBe(true);
    const changed = await db.withUser("dave", async (c) => (await c.query("update project_members set role = 'owner' where user_id = 'dave'")).rowCount);
    expect(changed).toBe(0);
  });
});

describe.runIf(enabled)("runs and tokens", () => {
  it("users can cancel but never complete or rewrite a run", async () => {
    expect(await denied(db.withUser("alice", (c) => c.query("update experiment_runs set status = 'running' where id = $1", [runId])))).toBe(true);
    expect(await denied(db.withUser("alice", (c) => c.query("update experiment_runs set parameters = '{}' where id = $1", [runId])))).toBe(true);
    expect(await denied(db.withUser("alice", (c) => c.query("insert into run_metrics (run_id, metric_name, metric_value) values ($1, 'x', 1)", [runId])))).toBe(true);
    const running = await db.withSystem(async (c) => (await c.query("insert into experiment_runs (project_id, name, status) values ($1, 'r2', 'running') returning id", [pid])).rows[0].id);
    const r = await db.withUser("alice", (c) => runs.updateRun(c, "alice", running, { status: "cancelled" }));
    expect(r.status).toBe("cancelled");
  });
  it("token hashes are never readable by users; tokens verify, revoke and expire", async () => {
    const t = await db.withUser("alice", (c) => tokens.createToken(c, "alice", pid, { name: "laptop" }));
    expect(t.token).toMatch(/^pt_[A-Za-z0-9_-]{43}$/);
    expect(await denied(db.withUser("alice", (c) => c.query("select token_hash from ingestion_tokens")))).toBe(true);
    const stored = await db.withSystem(async (c) => (await c.query("select token_hash from ingestion_tokens where id = $1", [t.id])).rows[0].token_hash);
    expect(stored).toBe(tokens.hashToken(t.token));
    expect(stored).not.toContain(t.token.slice(3));
    expect(await db.withSystem((c) => tokens.verifyToken(c, t.token))).toMatchObject({ project_id: pid });
    expect(await db.withSystem((c) => tokens.verifyToken(c, t.token.slice(0, -1) + "A"))).toBeNull();
    expect(await db.withSystem((c) => tokens.verifyToken(c, "not-a-token"))).toBeNull();
    await db.withUser("alice", (c) => tokens.revokeToken(c, "alice", pid, t.id));
    expect(await db.withSystem((c) => tokens.verifyToken(c, t.token))).toBeNull();
    const e = await db.withUser("alice", (c) => tokens.createToken(c, "alice", pid, { name: "short" }));
    await db.withSystem((c) => c.query("update ingestion_tokens set expires_at = now() - interval '1 minute' where id = $1", [e.id]));
    expect(await db.withSystem((c) => tokens.verifyToken(c, e.token))).toBeNull();
  });
  it("bob cannot create a token for alice's project", async () => {
    expect(await denied(db.withUser("bob", (c) => tokens.createToken(c, "bob", pid, { name: "x" })))).toBe(true);
  });
});

describe.runIf(enabled)("integrity", () => {
  it("deleting a project removes its runs, metrics, tokens and records", async () => {
    const p = await db.withUser("alice", (c) => projects.createProject(c, "alice", { title: "temp", description: null, kind: "computational_reproduction", code_url: null, code_commit: null }));
    await db.withSystem(async (c) => {
      const r = (await c.query("insert into experiment_runs (project_id, name) values ($1, 'x') returning id", [p.id])).rows[0].id;
      await c.query("insert into run_metrics (run_id, metric_name, metric_value) values ($1, 'a', 1)", [r]);
    });
    await db.withUser("alice", (c) => projects.deleteProject(c, p.id));
    const left = await db.withSystem(async (c) => (await c.query("select (select count(*) from experiment_runs where project_id = $1) + (select count(*) from protocols where project_id = $1) + (select count(*) from project_members where project_id = $1) as n", [p.id])).rows[0].n);
    expect(Number(left)).toBe(0);
  });
  it("constraints reject invalid values", async () => {
    expect(await denied(db.withSystem((c) => c.query("insert into experiment_runs (project_id, name, status) values ($1, 'x', 'done')", [pid])))).toBe(true);
    expect(await denied(db.withSystem((c) => c.query("insert into run_metrics (run_id, metric_name, metric_value) values ($1, 'x', 'NaN')", [runId])))).toBe(true);
    expect(await denied(db.withSystem((c) => c.query("insert into artifacts (project_id, run_id, file_name, file_type, file_size, checksum) values ($1, $2, '../x', 'text/plain', 1, repeat('a', 64))", [pid, runId])))).toBe(true);
  });
});
