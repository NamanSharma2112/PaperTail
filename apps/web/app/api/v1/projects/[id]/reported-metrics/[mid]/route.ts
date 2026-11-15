import { withUser } from "@/lib/server/db";
import { requireUuid, userRoute } from "@/lib/server/http";
import { deleteReported } from "@/lib/server/services/records";

export const DELETE = userRoute<{ id: string; mid: string }>(async (_req, user, { id, mid }) => {
  await withUser(user.id, (db) => deleteReported(db, user.id, requireUuid(id, "Project"), requireUuid(mid, "Published result")));
  return new Response(null, { status: 204 });
});
