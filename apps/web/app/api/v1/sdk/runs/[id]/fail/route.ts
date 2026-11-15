import { ok, publicRoute, readJson, requireUuid } from "@/lib/server/http";
import { failRun, withToken } from "@/lib/server/services/ingest";
import { sdkFail } from "@/lib/schemas";

export const POST = publicRoute<{ id: string }>(async (req, { id }) => {
  const input = sdkFail.parse(await readJson(req, 64 * 1024));
  return ok({ run: await withToken(req, (db, token) => failRun(db, token, requireUuid(id, "Run"), input)) });
});
