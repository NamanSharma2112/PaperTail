import { withUser } from "@/lib/server/db";
import { ok, readJson, requireUuid, userRoute } from "@/lib/server/http";
import { createDeviation, listDeviations } from "@/lib/server/services/records";
import { deviationCreate } from "@/lib/schemas";

type P = { id: string };
export const GET = userRoute<P>(async (_req, user, { id }) => ok({ deviations: await withUser(user.id, (db) => listDeviations(db, requireUuid(id, "Project"))) }));
export const POST = userRoute<P>(async (req, user, { id }) => {
  const input = deviationCreate.parse(await readJson(req));
  return ok(await withUser(user.id, (db) => createDeviation(db, user.id, requireUuid(id, "Project"), input)), 201);
});
