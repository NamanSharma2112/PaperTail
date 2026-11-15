import { withUser } from "@/lib/server/db";
import { ok, readJson, userRoute } from "@/lib/server/http";
import { createProject, listProjects } from "@/lib/server/services/projects";
import { projectCreate } from "@/lib/schemas";

export const GET = userRoute(async (_req, user) => ok({ projects: await withUser(user.id, listProjects) }));
export const POST = userRoute(async (req, user) => {
  const input = projectCreate.parse(await readJson(req));
  return ok(await withUser(user.id, (db) => createProject(db, user.id, input)), 201);
});
