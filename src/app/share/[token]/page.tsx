import {
  PublicItinerary,
  ShareUnavailable,
} from "@/features/sharing/components/public-itinerary";
import { verifyPlanShareToken } from "@/features/sharing/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const shared = await verifyPlanShareToken(token);
  return shared ? (
    <PublicItinerary
      itinerary={shared.itinerary}
      generatedAt={new Date().toISOString()}
    />
  ) : (
    <ShareUnavailable />
  );
}
