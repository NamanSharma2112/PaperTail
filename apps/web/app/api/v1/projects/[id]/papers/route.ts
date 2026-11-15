import { z } from "zod";
import { withUser } from "@/lib/server/db";
import { ApiError, ok, readJson, requireUuid, userRoute } from "@/lib/server/http";
import { projectRole } from "@/lib/server/services/common";
import { linkPaper } from "@/lib/server/services/projects";

export const POST = userRoute<{ id: string }>(async (req, user, { id }) => {
  const { paper_id } = z.object({ paper_id: z.string().uuid() }).parse(await readJson(req));
  await withUser(user.id, async (db) => {
    if ((await projectRole(db, requireUuid(id, "Project"))) === "viewer") throw new ApiError(403, "forbidden", "Viewers cannot link papers");
    await linkPaper(db, id, paper_id);
  });
  return ok({ linked: true }, 201);
});
