import { withUser } from "@/lib/server/db";
import { ok, requireUuid, userRoute } from "@/lib/server/http";
import { recentActivity } from "@/lib/server/services/records";

export const GET = userRoute<{ id: string }>(async (_req, user, { id }) => ok({ activity: await withUser(user.id, (db) => recentActivity(db, requireUuid(id, "Project"), 50)) }));
