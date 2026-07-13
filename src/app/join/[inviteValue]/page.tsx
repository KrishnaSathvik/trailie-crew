import { JoinTripForm } from "@/features/trips/components/join-trip-form";
import { TripEntryLayout } from "@/features/trips/components/trip-entry-layout";

export default async function JoinInvitePage({
  params,
}: {
  params: Promise<{ inviteValue: string }>;
}) {
  const { inviteValue } = await params;
  return (
    <TripEntryLayout
      eyebrow="Private invitation"
      title="Join the Trip."
      description="Your invitation is ready. Choose the name your crew will see; trip details come later in the shared space."
    >
      <JoinTripForm initialInviteValue={inviteValue} />
    </TripEntryLayout>
  );
}
