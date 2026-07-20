"use client";

import { useEffect, useState } from "react";
import type { ItineraryMapProjectionV1, TripPlanView } from "@trailie/schemas";
import type { MapConfiguration } from "../config";
import { getPlanMapProjectionAction } from "../actions";
import { MapWorkspace } from "./map-workspace";

type LoadedMap = Readonly<{
  projection: ItineraryMapProjectionV1;
  configuration: MapConfiguration;
}>;

export function ItineraryMapLoader({
  plan,
  onViewEvidence,
}: {
  plan: TripPlanView;
  onViewEvidence?: () => void;
}) {
  const [loaded, setLoaded] = useState<LoadedMap | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void getPlanMapProjectionAction(plan.roomId, plan.version).then(
      (result) => {
        if (!active) return;
        if (result.ok) setLoaded(result.data);
        else setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [plan.roomId, plan.version]);

  if (!plan.itinerary) return null;
  if (failed)
    return (
      <div className="flex min-h-80 flex-col items-center justify-center px-5 text-center">
        <p className="max-w-md font-semibold">
          Map view is unavailable. Your itinerary is still fully accessible.
        </p>
        <p className="text-muted-foreground mt-2 max-w-md text-sm">
          Open Day-by-day or Travel for the complete non-map plan.
        </p>
      </div>
    );
  if (!loaded)
    return (
      <div
        className="flex min-h-80 items-center justify-center"
        role="status"
        aria-live="polite"
      >
        Preparing the map…
      </div>
    );
  return (
    <MapWorkspace
      itinerary={plan.itinerary}
      projection={loaded.projection}
      configuration={loaded.configuration}
      onViewEvidence={onViewEvidence}
    />
  );
}
