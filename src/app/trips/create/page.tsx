import { CreateTripForm } from "@/features/trips/components/create-trip-form";
import { TripEntryLayout } from "@/features/trips/components/trip-entry-layout";

export default function CreateTripPage() {
  return (
    <TripEntryLayout
      eyebrow="Create a Trip"
      title="Start with a trip name."
      description="That is all you need for now. Your crew can work out destinations, dates, and priorities together."
    >
      <CreateTripForm />
    </TripEntryLayout>
  );
}
