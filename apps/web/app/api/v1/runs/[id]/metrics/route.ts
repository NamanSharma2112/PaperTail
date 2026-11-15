import { withUser } from "@/lib/server/db";
import { ok, requireUuid, userRoute } from "@/lib/server/http";
import { runMetrics } from "@/lib/server/services/runs";

export const GET = userRoute<{ id: string }>(async (_req, user, { id }) => ok({ metrics: await withUser(user.id, (db) => runMetrics(db, requireUuid(id, "Run"))) }));
