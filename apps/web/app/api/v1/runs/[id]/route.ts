import { withUser } from "@/lib/server/db";
import { ok, readJson, requireUuid, userRoute } from "@/lib/server/http";
import { deleteRun, getRun, updateRun } from "@/lib/server/services/runs";
import { runUpdate } from "@/lib/schemas";

type P = { id: string };
export const GET = userRoute<P>(async (_req, user, { id }) => ok(await withUser(user.id, (db) => getRun(db, requireUuid(id, "Run")))));
export const PATCH = userRoute<P>(async (req, user, { id }) => {
  const input = runUpdate.parse(await readJson(req));
  return ok(await withUser(user.id, (db) => updateRun(db, user.id, requireUuid(id, "Run"), input)));
});
export const DELETE = userRoute<P>(async (_req, user, { id }) => {
  await withUser(user.id, (db) => deleteRun(db, user.id, requireUuid(id, "Run")));
  return new Response(null, { status: 204 });
});
