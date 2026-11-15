import { withUser } from "@/lib/server/db";
import { ok, readJson, requireUuid, userRoute } from "@/lib/server/http";
import { deleteProject, getProject, missingInformation, updateProject } from "@/lib/server/services/projects";
import { projectUpdate } from "@/lib/schemas";

type P = { id: string };
export const GET = userRoute<P>(async (_req, user, { id }) =>
  ok(await withUser(user.id, async (db) => ({ ...(await getProject(db, requireUuid(id, "Project"))), missing: await missingInformation(db, id) }))),
);
export const PATCH = userRoute<P>(async (req, user, { id }) => {
  const input = projectUpdate.parse(await readJson(req));
  return ok(await withUser(user.id, (db) => updateProject(db, user.id, requireUuid(id, "Project"), input)));
});
export const DELETE = userRoute<P>(async (_req, user, { id }) => {
  await withUser(user.id, (db) => deleteProject(db, requireUuid(id, "Project")));
  return new Response(null, { status: 204 });
});
