import { withUser } from "@/lib/server/db";
import { ok, readJson, requireUuid, userRoute } from "@/lib/server/http";
import { listReported, upsertReported } from "@/lib/server/services/records";
import { reportedMetricUpsert } from "@/lib/schemas";

type P = { id: string };
export const GET = userRoute<P>(async (_req, user, { id }) => ok({ reported_metrics: await withUser(user.id, (db) => listReported(db, requireUuid(id, "Project"))) }));
export const PUT = userRoute<P>(async (req, user, { id }) => {
  const input = reportedMetricUpsert.parse(await readJson(req));
  return ok(await withUser(user.id, (db) => upsertReported(db, user.id, requireUuid(id, "Project"), input)));
});
