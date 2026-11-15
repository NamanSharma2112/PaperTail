import { withUser } from "@/lib/server/db";
import { ok, userRoute } from "@/lib/server/http";
import { dashboard } from "@/lib/server/services/dashboard";

export const GET = userRoute(async (_req, user) => ok(await withUser(user.id, (db) => dashboard(db, user.id))));
