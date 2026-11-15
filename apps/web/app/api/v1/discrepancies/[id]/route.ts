import { withUser } from "@/lib/server/db";
import { ok, readJson, requireUuid, userRoute } from "@/lib/server/http";
import { deleteDiscrepancy, updateDiscrepancy } from "@/lib/server/services/records";
import { discrepancyUpdate } from "@/lib/schemas";

type P = { id: string };
export const PATCH = userRoute<P>(async (req, user, { id }) => {
  const input = discrepancyUpdate.parse(await readJson(req));
  return ok(await withUser(user.id, (db) => updateDiscrepancy(db, user.id, requireUuid(id, "Discrepancy"), input)));
});
export const DELETE = userRoute<P>(async (_req, user, { id }) => {
  await withUser(user.id, (db) => deleteDiscrepancy(db, user.id, requireUuid(id, "Discrepancy")));
  return new Response(null, { status: 204 });
});
