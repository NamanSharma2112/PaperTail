import { withUser } from "@/lib/server/db";
import { ApiError, isUuid, ok, requireUuid, userRoute } from "@/lib/server/http";
import { compareRuns } from "@/lib/server/services/runs";

export const GET = userRoute<{ id: string }>(async (req, user, { id }) => {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean);
  if (ids.length < 2 || ids.length > 10 || !ids.every(isUuid)) throw new ApiError(422, "invalid_value", "Pass 2 to 10 run ids as ?ids=a,b");
  return ok(await withUser(user.id, (db) => compareRuns(db, requireUuid(id, "Project"), ids)));
});
