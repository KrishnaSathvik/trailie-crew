import { z } from "zod";
import Link from "next/link";

import { TripShell } from "@/features/trips/components/trip-shell";
import { getTripShell } from "@/features/trips/queries/get-trip-shell";

export const runtime = "nodejs";
export const maxDuration = 300;

function UnavailableTrip() {
  return (
    <main className="bg-background text-foreground flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-muted-foreground font-mono text-[0.6875rem] tracking-[0.16em] uppercase">
          Trip access
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.055em]">
          Trip unavailable
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-6">
          This Trip does not exist, is no longer active, or is not available in
          your current session.
        </p>
        <Link
          href="/"
          className="bg-foreground text-background rounded-control mt-7 inline-flex min-h-11 items-center px-4 text-sm font-semibold"
        >
          Return home
        </Link>
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
