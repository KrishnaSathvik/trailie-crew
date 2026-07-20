"use client";

import { useEffect, useMemo, useState } from "react";
import type { ItineraryMapProjectionV1 } from "@trailie/schemas";
import type { MapConfiguration } from "../config";
import {
  buildSpatialCompareAnnotations,
  type SpatialCompareAnnotation,
} from "../projection";
import { getPlanMapProjectionAction } from "../actions";
import { MapWorkspace } from "./map-workspace";

type LoadedCompare = Readonly<{
  base: ItineraryMapProjectionV1;
  candidate: ItineraryMapProjectionV1;
  configuration: MapConfiguration;
}>;

export function SpatialCompare({
  roomId,
  baseVersion,
  candidateVersion,
}: {
  roomId: string;
  baseVersion: number;
  candidateVersion: number;
}) {
  const [loaded, setLoaded] = useState<LoadedCompare | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.all([
      getPlanMapProjectionAction(roomId, baseVersion),
      getPlanMapProjectionAction(roomId, candidateVersion),
    ]).then(([base, candidate]) => {
      if (!active) return;
      if (!base.ok || !candidate.ok) {
        setFailed(true);
        return;
      }
      setLoaded({
        base: base.data.projection,
        candidate: candidate.data.projection,
        configuration: candidate.data.configuration,
      });
    });
    return () => {
      active = false;
    };
  }, [baseVersion, candidateVersion, roomId]);
  const annotations = useMemo<SpatialCompareAnnotation[]>(
    () =>
      loaded
        ? buildSpatialCompareAnnotations(loaded.base, loaded.candidate)
        : [],
    [loaded],
  );

  if (failed)
    return (
      <p className="text-muted-foreground mt-5 text-sm">
        The map comparison is unavailable. The Plan changes above remain
        available.
      </p>
    );
  if (!loaded)
    return (
      <p className="text-muted-foreground mt-5 text-sm" role="status">
        Preparing map changes…
      </p>
    );
  return (
    <section aria-labelledby="spatial-compare-title" className="mt-7">
      <h3 id="spatial-compare-title" className="text-lg font-semibold">
        Map changes
      </h3>
      <p className="text-muted-foreground mt-2 text-sm">
        Map for Version {candidateVersion}. Places changed from Version{" "}
        {baseVersion} are emphasized.
      </p>
      {annotations.length ? (
        <div className="border-border mt-4 h-[38rem] overflow-hidden rounded-md border">
          <MapWorkspace
            itinerary={{
              title: `Version ${candidateVersion} map comparison`,
            }}
            projection={loaded.candidate}
            configuration={loaded.configuration}
            compareAnnotations={annotations}
          />
        </div>
      ) : (
        <p className="mt-4 text-sm">No map changes between these versions.</p>
      )}
    </section>
  );
}
