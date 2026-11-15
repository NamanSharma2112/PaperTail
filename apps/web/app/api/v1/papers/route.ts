import { withUser } from "@/lib/server/db";
import { ok, userRoute } from "@/lib/server/http";
import { listPapers } from "@/lib/server/services/papers";

export const GET = userRoute(async (req, user) => {
  const u = new URL(req.url);
  const papers = await withUser(user.id, (db) =>
    listPapers(db, user.id, { q: u.searchParams.get("q") ?? undefined, status: u.searchParams.get("status") ?? undefined, sort: u.searchParams.get("sort") ?? undefined }),
  );
  return ok({ papers });
});
