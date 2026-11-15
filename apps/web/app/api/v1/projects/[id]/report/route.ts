import { withUser } from "@/lib/server/db";
import { ok, requireUuid, userRoute } from "@/lib/server/http";
import { buildReport } from "@/lib/server/services/report";

export const GET = userRoute<{ id: string }>(async (_req, user, { id }) => ok(await withUser(user.id, (db) => buildReport(db, requireUuid(id, "Project")))));
