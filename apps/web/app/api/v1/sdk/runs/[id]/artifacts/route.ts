import { ApiError, ok, publicRoute, requireUuid } from "@/lib/server/http";
import { addArtifact, withToken } from "@/lib/server/services/ingest";
import { ARTIFACT_MAX_BYTES, artifactMeta } from "@/lib/schemas";

/** Upload one small file as the raw request body. Headers: X-File-Name, Content-Type. */
export const POST = publicRoute<{ id: string }>(async (req, { id }) => {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > ARTIFACT_MAX_BYTES) throw new ApiError(413, "payload_too_large", "Artifacts are limited to 2 MB each");
  const meta = artifactMeta.parse({
    file_name: decodeURIComponent(req.headers.get("x-file-name") ?? ""),
    file_type: (req.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim(),
  });
  const content = Buffer.from(await req.arrayBuffer());
  if (content.length > ARTIFACT_MAX_BYTES) throw new ApiError(413, "payload_too_large", "Artifacts are limited to 2 MB each");
  return ok({ artifact: await withToken(req, (db, token) => addArtifact(db, token, requireUuid(id, "Run"), meta, content)) }, 201);
});
