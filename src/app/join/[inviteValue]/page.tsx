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
      description="Choose the name your crew will see. You will enter the shared Trip after joining."
      footnote="Next: your crew's chat, with everything they have planned so far."
    >
      <JoinTripForm initialInviteValue={inviteValue} />
    </TripEntryLayout>
  );
}
