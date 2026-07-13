import { z } from "zod";

import { TripShell } from "@/features/trips/components/trip-shell";
import { getTripShell } from "@/features/trips/queries/get-trip-shell";

function UnavailableTrip() {
  return (
    <main className="bg-background text-foreground flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-muted-foreground font-mono text-[0.6875rem] tracking-[0.16em] uppercase">
          Not found · Access denied
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.055em]">
          Trip unavailable
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-6">
          This Trip does not exist, is no longer active, or is not available to
          your current session.
        </p>
      </div>
    </main>
  );
}

export default async function TripPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  if (!z.uuid().safeParse(roomId).success) return <UnavailableTrip />;
  const data = await getTripShell(roomId);
  return data ? <TripShell data={data} /> : <UnavailableTrip />;
}
