import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pool, withSystem } from "./db";
import { sendEmail } from "./email";

export const auth = betterAuth({
  database: pool(),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_URL,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: true,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 30,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your PaperTrail password",
        text: `Someone asked to reset the password for this PaperTrail account.\n\nReset it here (valid for 30 minutes):\n${url}\n\nIf it wasn't you, ignore this email.`,
      });
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, window: 60, max: 60 },
  databaseHooks: {
    user: {
      create: {
        // Every account gets a profile row; the user owns it under RLS from then on.
        after: async (user) => {
          await withSystem((db) =>
            db.query("insert into profiles (id, display_name) values ($1, $2) on conflict (id) do nothing", [user.id, user.name ?? ""]),
          );
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type SessionUser = { id: string; email: string; name: string };

/** The signed-in user, or null. Use in server components and route handlers. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

/** For pages: send signed-out visitors to the login page. */
export async function requireUserPage(next?: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}
