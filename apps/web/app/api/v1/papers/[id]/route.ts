import { withUser } from "@/lib/server/db";
import { ok, readJson, requireUuid, userRoute } from "@/lib/server/http";
import { deletePaper, getPaper, updatePaper } from "@/lib/server/services/papers";
import { paperUpdate } from "@/lib/schemas";

type P = { id: string };
export const GET = userRoute<P>(async (_req, user, { id }) => ok(await withUser(user.id, (db) => getPaper(db, requireUuid(id, "Paper")))));
export const PATCH = userRoute<P>(async (req, user, { id }) => {
  const input = paperUpdate.parse(await readJson(req));
  return ok(await withUser(user.id, (db) => updatePaper(db, requireUuid(id, "Paper"), input)));
});
export const DELETE = userRoute<P>(async (_req, user, { id }) => {
  await withUser(user.id, (db) => deletePaper(db, requireUuid(id, "Paper")));
  return new Response(null, { status: 204 });
});
