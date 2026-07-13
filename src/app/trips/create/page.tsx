import { CreateTripForm } from "@/features/trips/components/create-trip-form";
import { TripEntryLayout } from "@/features/trips/components/trip-entry-layout";

export default function CreateTripPage() {
  return (
    <TripEntryLayout
      eyebrow="Create a Trip"
      title="Name the adventure."
      description="That is all the planning needed for now. Your crew will discover destinations, dates, and priorities together later."
    >
      <CreateTripForm />
    </TripEntryLayout>
  );
}
