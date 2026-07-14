import { z } from "zod";

import { authorizePlanExport } from "@/features/exports/authorization";
import { generateIcs } from "@/features/exports/ics";
import { getPlanVersionAction } from "@/features/revisions/actions";
import { projectPublicItinerary } from "@/features/sharing/public-projection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  roomId: z.uuid(),
  version: z.coerce.number().int().positive(),
});

function unavailable(
  code:
    | "export_unavailable"
    | "rate_limited"
    | "invalid_export_type"
    | "export_not_allowed"
    | "export_generation_failed" = "export_unavailable",
) {
  return Response.json(
    { code },
    {
      status: code === "rate_limited" ? 429 : 404,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string; version: string }> },
) {
  void request;
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return unavailable("invalid_export_type");
  const authorization = await authorizePlanExport({
    roomId: parsed.data.roomId,
    version: parsed.data.version,
    type: "calendar",
  });
  if (authorization !== "allowed")
    return unavailable(
      authorization === "rate_limited" ? "rate_limited" : "export_not_allowed",
    );
  const result = await getPlanVersionAction(
    parsed.data.roomId,
    parsed.data.version,
  );
  if (
    !result.ok ||
    result.data.status !== "published" ||
    !result.data.itinerary ||
    !result.data.publishedAt
  )
    return unavailable("export_not_allowed");
  let generated: ReturnType<typeof generateIcs>;
  try {
    generated = generateIcs(
      projectPublicItinerary({
        itinerary: result.data.itinerary,
        version: result.data.version,
        publishedAt: result.data.publishedAt,
        validationStatus: result.data.validationStatus,
      }),
    );
  } catch {
    return unavailable("export_generation_failed");
  }
  return new Response(generated.content, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="trailie-itinerary-v${result.data.version}.ics"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "X-Trailie-Plan-Version": String(result.data.version),
      "X-Trailie-Content-Hash": generated.contentHash,
      "X-Trailie-Omitted-Untimed": String(generated.omittedUntimed),
    },
  });
}
