import { withUser } from "@/lib/server/db";
import { ok, readJson, userRoute } from "@/lib/server/http";
import { one } from "@/lib/server/services/common";
import { profileUpdate } from "@/lib/schemas";

export const GET = userRoute(async (_req, user) => {
  const profile = await withUser(user.id, (db) => one(db, "select * from profiles where id = $1", [user.id], "Profile"));
  return ok({ user: { id: user.id, email: user.email }, profile });
});
export const PATCH = userRoute(async (req, user) => {
  const input = profileUpdate.parse(await readJson(req));
  const profile = await withUser(user.id, (db) =>
    one(db, "update profiles set display_name = $2, affiliation = $3 where id = $1 returning *", [user.id, input.display_name, input.affiliation], "Profile"),
  );
  return ok({ profile });
});
