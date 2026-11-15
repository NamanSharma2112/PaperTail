import { withUser } from "@/lib/server/db";
import { requireUuid, userRoute } from "@/lib/server/http";
import { deleteDeviation } from "@/lib/server/services/records";

export const DELETE = userRoute<{ id: string; did: string }>(async (_req, user, { id, did }) => {
  await withUser(user.id, (db) => deleteDeviation(db, user.id, requireUuid(id, "Project"), requireUuid(did, "Deviation")));
  return new Response(null, { status: 204 });
});
