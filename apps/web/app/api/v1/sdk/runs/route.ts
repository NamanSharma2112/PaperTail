import { ok, publicRoute, readJson } from "@/lib/server/http";
import { createRun, withToken } from "@/lib/server/services/ingest";
import { sdkRunCreate } from "@/lib/schemas";

export const POST = publicRoute(async (req) => {
  const input = sdkRunCreate.parse(await readJson(req, 512 * 1024));
  const { run, created } = await withToken(req, (db, token) => createRun(db, token, input));
  return ok({ run }, created ? 201 : 200);
});
