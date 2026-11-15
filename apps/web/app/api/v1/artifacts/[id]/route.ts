import { withUser } from "@/lib/server/db";
import { requireUuid, userRoute } from "@/lib/server/http";
import { one } from "@/lib/server/services/common";

/** Download an artifact. RLS limits it to project members; served as an attachment
 * with no content sniffing, so an uploaded file can never run in the app's origin. */
export const GET = userRoute<{ id: string }>(async (_req, user, { id }) => {
  const a = await withUser(user.id, (db) =>
    one<{ file_name: string; file_type: string; content: Buffer }>(
      db,
      "select a.file_name, a.file_type, b.content from artifacts a join artifact_blobs b on b.artifact_id = a.id where a.id = $1",
      [requireUuid(id, "Artifact")],
      "Artifact",
    ),
  );
  return new Response(new Uint8Array(a.content), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${a.file_name.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
});
