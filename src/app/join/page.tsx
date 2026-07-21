import { JoinTripForm } from "@/features/trips/components/join-trip-form";
import { TripEntryLayout } from "@/features/trips/components/trip-entry-layout";

export default function JoinTripPage() {
  return (
    <TripEntryLayout
      eyebrow="Join a Trip"
      title="Find your crew."
      description="Use the private invitation link or Trip code your host shared, then choose the name your crew will see."
      footnote="Next: your crew's chat, with everything they have planned so far."
    >
      <JoinTripForm />
    </TripEntryLayout>
  );
}
