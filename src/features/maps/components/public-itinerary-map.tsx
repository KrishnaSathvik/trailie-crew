"use client";

import type { ItineraryMapProjectionV1 } from "@trailie/schemas";
import type { MapConfiguration } from "../config";
import { MapWorkspace } from "./map-workspace";

export function PublicItineraryMap({
  title,
  projection,
  configuration,
}: {
  title: string;
  projection: ItineraryMapProjectionV1;
  configuration: MapConfiguration;
}) {
  return (
    <section
      aria-labelledby="shared-map-heading"
      className="public-section border-border mt-16 border-t pt-8 print:hidden"
    >
      <h2
        id="shared-map-heading"
        className="text-2xl font-semibold tracking-[-0.035em]"
      >
        Privacy-safe map
      </h2>
      <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">
        This map is pinned to the shared version. Private locations are hidden,
        and conditions may have changed since publication.
      </p>
      <div className="border-border mt-6 min-h-[34rem] overflow-hidden rounded-md border">
        <MapWorkspace
          itinerary={{ title }}
          projection={projection}
          configuration={configuration}
        />
      </div>
    </section>
  );
}
