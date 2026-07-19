"use client";

import type { MapCanvasProps } from "./map-workspace";

function position(
  longitude: number,
  latitude: number,
  bounds: [number, number, number, number] | null,
) {
  if (!bounds) return { left: "50%", top: "50%" };
  const width = Math.max(bounds[2] - bounds[0], 0.0001);
  const height = Math.max(bounds[3] - bounds[1], 0.0001);
  return {
    left: `${Math.min(94, Math.max(6, ((longitude - bounds[0]) / width) * 100))}%`,
    top: `${Math.min(94, Math.max(6, (1 - (latitude - bounds[1]) / height) * 100))}%`,
  };
}

export function DeterministicMapCanvas({
  projection,
  markers,
  selectedMarkerId,
  onSelectMarker,
}: MapCanvasProps) {
  return (
    <div
      className="bg-subtle relative h-full min-h-[30rem] overflow-hidden"
      aria-label={`Deterministic itinerary map for Version ${projection.planVersion}`}
    >
      <div
        aria-hidden="true"
        className="border-border absolute inset-6 rounded-[45%] border"
      />
      {markers.map((marker) => {
        if (marker.coordinates === null || marker.privacyLevel === "omitted")
          return null;
        return (
          <button
            type="button"
            key={marker.markerId}
            onClick={() => onSelectMarker(marker.markerId)}
            aria-label={`${marker.label}. ${marker.verificationState} location.`}
            className={`trailie-map-marker absolute -translate-x-1/2 -translate-y-1/2 ${marker.markerId === selectedMarkerId ? "is-selected" : ""}`}
            style={position(
              marker.coordinates.longitude,
              marker.coordinates.latitude,
              projection.viewport.bounds,
            )}
          >
            <span aria-hidden="true">{marker.shortLabel}</span>
          </button>
        );
      })}
      <p className="text-muted-foreground absolute right-4 bottom-4 font-mono text-[0.5625rem] tracking-wider uppercase">
        Deterministic local adapter
      </p>
    </div>
  );
}
