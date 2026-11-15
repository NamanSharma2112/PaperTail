import { withUser } from "@/lib/server/db";
import { requireUuid, userRoute } from "@/lib/server/http";
import { deleteDataset } from "@/lib/server/services/records";

export const DELETE = userRoute<{ id: string; did: string }>(async (_req, user, { id, did }) => {
  await withUser(user.id, (db) => deleteDataset(db, user.id, requireUuid(id, "Project"), requireUuid(did, "Dataset")));
  return new Response(null, { status: 204 });
});
