import { ok, publicRoute, readJson, requireUuid } from "@/lib/server/http";
import { addMetrics, withToken } from "@/lib/server/services/ingest";
import { sdkMetrics } from "@/lib/schemas";

export const POST = publicRoute<{ id: string }>(async (req, { id }) => {
  const { metrics } = sdkMetrics.parse(await readJson(req));
  return ok(await withToken(req, (db, token) => addMetrics(db, token, requireUuid(id, "Run"), metrics)), 201);
});
