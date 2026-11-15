import { ok, publicRoute, readJson, requireUuid } from "@/lib/server/http";
import { completeRun, withToken } from "@/lib/server/services/ingest";
import { sdkComplete } from "@/lib/schemas";

export const POST = publicRoute<{ id: string }>(async (req, { id }) => {
  const input = sdkComplete.parse(await readJson(req));
  return ok({ run: await withToken(req, (db, token) => completeRun(db, token, requireUuid(id, "Run"), input)) });
});
