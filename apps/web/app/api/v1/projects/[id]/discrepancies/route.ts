import { withUser } from "@/lib/server/db";
import { ok, readJson, requireUuid, userRoute } from "@/lib/server/http";
import { createDiscrepancy, listDiscrepancies } from "@/lib/server/services/records";
import { discrepancyCreate } from "@/lib/schemas";

type P = { id: string };
export const GET = userRoute<P>(async (_req, user, { id }) => ok({ discrepancies: await withUser(user.id, (db) => listDiscrepancies(db, requireUuid(id, "Project"))) }));
export const POST = userRoute<P>(async (req, user, { id }) => {
  const input = discrepancyCreate.parse(await readJson(req));
  return ok(await withUser(user.id, (db) => createDiscrepancy(db, user.id, requireUuid(id, "Project"), input)), 201);
});
