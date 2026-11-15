import { pool } from "@/lib/server/db";
import { ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await pool().query("select 1");
    return ok({ status: "ok", database: "ok" });
  } catch (err) {
    console.error("[health] database check failed", (err as Error).message);
    return ok({ status: "degraded", database: "unreachable" }, 503);
  }
}
