import {
  PublicItinerary,
  ShareUnavailable,
} from "@/features/sharing/components/public-itinerary";
import { verifyPlanShareToken } from "@/features/sharing/repository";
import { loadPublicMapProjection } from "@/features/maps/repository";
import { getServerMapConfiguration } from "@/features/maps/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const shared = await verifyPlanShareToken(token);
  let map = null;
  if (shared) {
    const projection = await loadPublicMapProjection(token);
    if (projection) {
      try {
        map = {
          projection,
          configuration: await getServerMapConfiguration(),
        };
      } catch {
        map = null;
      }
    }
  }
  return shared ? (
    <PublicItinerary
      itinerary={shared.itinerary}
      generatedAt={new Date().toISOString()}
      map={map}
    />
  ) : (
    <ShareUnavailable />
  );
}
