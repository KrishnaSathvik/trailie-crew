import type { Metadata } from "next";
import { z } from "zod";

import { authorizePlanExport } from "@/features/exports/authorization";
import { getPlanVersionAction } from "@/features/revisions/actions";
import { contentHash } from "@/features/sharing/content-hash";
import {
  PublicItinerary,
  ShareUnavailable,
} from "@/features/sharing/components/public-itinerary";
import { projectPublicItinerary } from "@/features/sharing/public-projection";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Print Plan · Trailie Crew",
  referrer: "no-referrer",
  robots: { index: false, follow: false, noarchive: true, nocache: true },
};

const paramsSchema = z.object({
  roomId: z.uuid(),
  version: z.coerce.number().int().positive(),
});

export default async function PrintPage({
  params,
}: {
  params: Promise<{ roomId: string; version: string }>;
}) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return <ShareUnavailable />;
  if (
    (await authorizePlanExport({
      roomId: parsed.data.roomId,
      version: parsed.data.version,
      type: "print",
    })) !== "allowed"
  )
    return <ShareUnavailable />;
  const result = await getPlanVersionAction(
    parsed.data.roomId,
    parsed.data.version,
  );
  if (!result.ok || !result.data.itinerary || !result.data.publishedAt)
    return <ShareUnavailable />;
  let itinerary;
  try {
    itinerary = projectPublicItinerary({
      itinerary: result.data.itinerary,
      version: result.data.version,
      publishedAt: result.data.publishedAt,
      validationStatus: result.data.validationStatus,
    });
  } catch {
    return <ShareUnavailable />;
  }
  return (
    <PublicItinerary
      itinerary={itinerary}
      generatedAt={new Date().toISOString()}
      contentHash={contentHash("print:v1", itinerary)}
    />
  );
}
