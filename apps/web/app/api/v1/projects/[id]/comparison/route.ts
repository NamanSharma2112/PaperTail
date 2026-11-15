import { withUser } from "@/lib/server/db";
import { ok, requireUuid, userRoute } from "@/lib/server/http";
import { compareProject } from "@/lib/server/services/comparison";

export const GET = userRoute<{ id: string }>(async (_req, user, { id }) =>
  ok({ comparisons: await withUser(user.id, (db) => compareProject(db, requireUuid(id, "Project"))) }),
);
