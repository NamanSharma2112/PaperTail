import { z } from "zod";
import { withUser } from "@/lib/server/db";
import { readJson, requireUuid, userRoute } from "@/lib/server/http";
import { buildReport, reportMarkdown } from "@/lib/server/services/report";

/** Markdown export. For PDF, the report page has a print stylesheet: use the browser's
 * Print → Save as PDF, which needs no paid service. */
export const POST = userRoute<{ id: string }>(async (req, user, { id }) => {
  z.object({ format: z.literal("markdown").default("markdown") }).parse(await readJson(req));
  const report = await withUser(user.id, (db) => buildReport(db, requireUuid(id, "Project")));
  const name = report.project.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "report";
  return new Response(reportMarkdown(report), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-reproduction-report.md"`, "Cache-Control": "no-store" },
  });
});
export const GET = POST;
