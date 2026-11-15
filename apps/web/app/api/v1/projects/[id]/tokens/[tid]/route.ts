import { withUser } from "@/lib/server/db";
import { requireUuid, userRoute } from "@/lib/server/http";
import { revokeToken } from "@/lib/server/services/tokens";

export const DELETE = userRoute<{ id: string; tid: string }>(async (_req, user, { id, tid }) => {
  await withUser(user.id, (db) => revokeToken(db, user.id, requireUuid(id, "Project"), requireUuid(tid, "Token")));
  return new Response(null, { status: 204 });
});
