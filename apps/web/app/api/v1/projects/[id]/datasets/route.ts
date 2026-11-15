import { withUser } from "@/lib/server/db";
import { ok, readJson, requireUuid, userRoute } from "@/lib/server/http";
import { listDatasets, upsertDataset } from "@/lib/server/services/records";
import { datasetUpsert } from "@/lib/schemas";

type P = { id: string };
export const GET = userRoute<P>(async (_req, user, { id }) => ok({ datasets: await withUser(user.id, (db) => listDatasets(db, requireUuid(id, "Project"))) }));
export const PUT = userRoute<P>(async (req, user, { id }) => {
  const input = datasetUpsert.parse(await readJson(req));
  return ok(await withUser(user.id, (db) => upsertDataset(db, user.id, requireUuid(id, "Project"), input)));
});
