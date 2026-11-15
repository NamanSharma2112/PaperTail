import { withUser } from "@/lib/server/db";
import { ok, userRoute } from "@/lib/server/http";
import { buildGraph } from "@/lib/server/services/graph";

export const GET = userRoute(async (_req, user) => ok(await withUser(user.id, buildGraph)));
