import "server-only";
import { notFound } from "next/navigation";
import { requireUserPage, type SessionUser } from "./auth";
import { withUser, type Db } from "./db";
import { ApiError } from "./http";

/** For server pages: the signed-in user's RLS-scoped database, with 404s mapped to the
 * not-found page. */
export async function pageData<T>(fn: (db: Db, user: SessionUser) => Promise<T>, next?: string): Promise<T> {
  const user = await requireUserPage(next);
  try {
    return await withUser(user.id, (db) => fn(db, user));
  } catch (err) {
    if ((err instanceof ApiError && err.status === 404) || (err as { code?: string }).code === "42501") notFound();
    throw err;
  }
}
