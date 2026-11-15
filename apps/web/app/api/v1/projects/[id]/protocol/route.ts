import { withUser } from "@/lib/server/db";
import { ok, readJson, requireUuid, userRoute } from "@/lib/server/http";
import { getProtocol, saveProtocol } from "@/lib/server/services/protocol";
import { protocolUpdate } from "@/lib/schemas";

type P = { id: string };
export const GET = userRoute<P>(async (_req, user, { id }) => ok(await withUser(user.id, (db) => getProtocol(db, requireUuid(id, "Project")))));
export const PUT = userRoute<P>(async (req, user, { id }) => {
  const input = protocolUpdate.parse(await readJson(req));
  return ok(await withUser(user.id, (db) => saveProtocol(db, user.id, requireUuid(id, "Project"), input)));
});
