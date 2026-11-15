import { withUser } from "@/lib/server/db";
import { ok, requireUuid, userRoute } from "@/lib/server/http";
import { listRuns } from "@/lib/server/services/runs";
import { RUN_STATUS } from "@/lib/schemas";

export const GET = userRoute<{ id: string }>(async (req, user, { id }) => {
  const u = new URL(req.url);
  const status = u.searchParams.get("status");
  const opts = {
    status: status && (RUN_STATUS as readonly string[]).includes(status) ? status : undefined,
    group: u.searchParams.get("group") ?? undefined,
    limit: Number(u.searchParams.get("limit") ?? 200) || 200,
    offset: Number(u.searchParams.get("offset") ?? 0) || 0,
  };
  return ok(await withUser(user.id, (db) => listRuns(db, requireUuid(id, "Project"), opts)));
});
