import { withUser } from "@/lib/server/db";
import { ok, readJson, requireUuid, userRoute } from "@/lib/server/http";
import { createToken, listTokens } from "@/lib/server/services/tokens";
import { tokenCreate } from "@/lib/schemas";

type P = { id: string };
export const GET = userRoute<P>(async (_req, user, { id }) => ok({ tokens: await withUser(user.id, (db) => listTokens(db, requireUuid(id, "Project"))) }));
export const POST = userRoute<P>(async (req, user, { id }) => {
  const input = tokenCreate.parse(await readJson(req));
  const created = await withUser(user.id, (db) => createToken(db, user.id, requireUuid(id, "Project"), input));
  return ok(created, 201, { "Cache-Control": "no-store" });
});
