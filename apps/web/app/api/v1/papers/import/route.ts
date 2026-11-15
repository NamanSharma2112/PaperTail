import { withUser } from "@/lib/server/db";
import { ok, rateLimit, readJson, userRoute } from "@/lib/server/http";
import { importPaper } from "@/lib/server/services/papers";
import { paperImport } from "@/lib/schemas";

export const POST = userRoute(async (req, user) => {
  rateLimit(`import:${user.id}`, 30);
  const { identifier } = paperImport.parse(await readJson(req));
  const result = await withUser(user.id, (db) => importPaper(db, user.id, identifier));
  return ok(result, result.existing ? 200 : 201);
});
