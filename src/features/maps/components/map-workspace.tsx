"use client";

import dynamic from "next/dynamic";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  List,
  Map as MapIcon,
  MapPin,
  Route,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import type {
  ItineraryMapMarkerV1,
  ItineraryMapProjectionV1,
  ItineraryMapRouteSegmentV1,
} from "@trailie/schemas";
import type { MapConfiguration } from "../config";
import type { SpatialCompareAnnotation } from "../projection";
import { DeterministicMapCanvas } from "./deterministic-map-canvas";

export type MapCanvasProps = Readonly<{
  configuration: MapConfiguration;
  projection: ItineraryMapProjectionV1;
  markers: readonly ItineraryMapMarkerV1[];
  routeSegments: readonly ItineraryMapRouteSegmentV1[];
  selectedMarkerId: string | null;
  onSelectMarker: (markerId: string) => void;
  onUnavailable: () => void;
  reducedMotion: boolean;
  emphasizedMarkerIds?: readonly string[];
}>;

const LazyMapboxCanvas = dynamic<MapCanvasProps>(
  () => import("./mapbox-canvas").then((module) => module.MapboxCanvas),
  {
    ssr: false,
    loading: () => (
      <div
        className="bg-subtle flex h-full min-h-96 items-center justify-center p-8 text-center"
        role="status"
      >
        Loading map…
      </div>
    ),
  },
);

type DayFilter = "all" | string;
type SheetPosition = "collapsed" | "half" | "expanded";

function routeLabel(segment: ItineraryMapRouteSegmentV1) {
  const duration =
    segment.durationMinutes === null
      ? "duration unavailable"
      : `${segment.durationMinutes} min`;
  const distance =
    segment.distanceMeters === null
      ? "distance unavailable"
      : `${Math.round(segment.distanceMeters / 1609.344)} mi`;
  return `${segment.mode} · ${duration} · ${distance}`;
}

function markerStatus(marker: ItineraryMapMarkerV1) {
  if (marker.privacyLevel === "omitted") return "Private location hidden";
  if (marker.coordinates === null) return "Location unavailable";
  if (marker.verificationState === "verified") return "Verified location";
  return "Location not verified";
}

function nextSheetPosition(position: SheetPosition): SheetPosition {
  if (position === "collapsed") return "half";
  if (position === "half") return "expanded";
  return "expanded";
}

function previousSheetPosition(position: SheetPosition): SheetPosition {
  if (position === "expanded") return "half";
  if (position === "half") return "collapsed";
  return "collapsed";
}

export function MapWorkspace({
  itinerary,
  projection,
  configuration,
  mapCanvas,
  compareAnnotations = [],
  onViewEvidence,
}: {
  itinerary: Readonly<{
    title: string;
    days?: ReadonlyArray<
      Readonly<{
        items: ReadonlyArray<
          Readonly<{
            id: string;
            description: string;
            location: Readonly<{ name: string }> | null;
          }>
        >;
      }>
    >;
  }>;
  projection: ItineraryMapProjectionV1;
  configuration: MapConfiguration;
  mapCanvas?: ComponentType<MapCanvasProps>;
  compareAnnotations?: readonly SpatialCompareAnnotation[];
  onViewEvidence?: () => void;
}) {
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const MapCanvas =
    mapCanvas ??
    (configuration.adapter === "deterministic"
      ? DeterministicMapCanvas
      : LazyMapboxCanvas);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [mobileMode, setMobileMode] = useState<"map" | "plan">("plan");
  const [sheetPosition, setSheetPosition] =
    useState<SheetPosition>("collapsed");
  const [sdkUnavailable, setSdkUnavailable] = useState(false);
  // Keep the server render and the browser's first render identical. Node can
  // expose a partial `navigator` without `onLine`, so reading it during state
  // initialization causes the public map to hydrate from two different trees.
  const [online, setOnline] = useState(true);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const itemDetails = useMemo(
    () =>
      new Map(
        (itinerary.days ?? []).flatMap((day) =>
          day.items.map((item) => [
            item.id,
            { description: item.description, location: item.location?.name },
          ]),
        ),
      ),
    [itinerary],
  );
  const markers = useMemo(
    () =>
      projection.markers.filter(
        (marker) =>
          marker.dayId === null ||
          dayFilter === "all" ||
          marker.dayId === dayFilter,
      ),
    [dayFilter, projection.markers],
  );
  const routes = useMemo(
    () =>
      projection.routeSegments.filter(
        (segment) => dayFilter === "all" || segment.dayId === dayFilter,
      ),
    [dayFilter, projection.routeSegments],
  );
  const emphasizedMarkerIds = useMemo(
    () => compareAnnotations.flatMap((annotation) => annotation.markerId ?? []),
    [compareAnnotations],
  );
  const selectedMarker =
    projection.markers.find((marker) => marker.markerId === selectedMarkerId) ??
    null;
  const mapUnavailable =
    !online ||
    !configuration.enabled ||
    (configuration.adapter === "mapbox" &&
      configuration.browserToken === null) ||
    sdkUnavailable ||
    !projection.markers.some(
      (marker) =>
        marker.coordinates !== null && marker.privacyLevel !== "omitted",
    );

  useEffect(() => {
    setOnline(window.navigator.onLine);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (sheetPosition !== "collapsed") {
        setSheetPosition("collapsed");
        return;
      }
      if (selectedMarkerId !== null) setSelectedMarkerId(null);
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedMarkerId, sheetPosition]);

  function selectFromMap(markerId: string) {
    const marker = projection.markers.find(
      (candidate) => candidate.markerId === markerId,
    );
    if (!marker) return;
    if (marker.dayId !== null && marker.dayId !== dayFilter)
      setDayFilter(marker.dayId);
    setSelectedMarkerId(markerId);
    cardRefs.current.get(markerId)?.focus({ preventScroll: true });
    const card = cardRefs.current.get(markerId);
    if (typeof card?.scrollIntoView === "function")
      card.scrollIntoView({
        behavior:
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        block: "nearest",
      });
  }

  function selectFromList(markerId: string) {
    setSelectedMarkerId(markerId);
    setMobileMode("map");
    setSheetPosition("collapsed");
  }

  function chooseDay(value: DayFilter) {
    setDayFilter(value);
    if (
      selectedMarker &&
      value !== "all" &&
      selectedMarker.dayId !== null &&
      selectedMarker.dayId !== value
    )
      setSelectedMarkerId(null);
  }

  return (
    <section
      data-testid="map-workspace"
      data-mobile-mode={mobileMode}
      className="relative min-h-0 flex-1"
      aria-labelledby="spatial-itinerary-title"
    >
      <a
        href="#spatial-itinerary-list"
        className="bg-background focus-visible:ring-ring sr-only z-50 rounded-md p-3 focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus-visible:ring-2"
      >
        Skip map
      </a>
      <div className="border-border flex items-center justify-between gap-4 border-b px-4 py-3 lg:hidden">
        <div
          className="bg-subtle grid grid-cols-2 rounded-md p-1"
          aria-label="Mobile itinerary view"
        >
          <button
            type="button"
            onClick={() => setMobileMode("map")}
            aria-pressed={mobileMode === "map"}
            className={`flex min-h-11 items-center gap-2 rounded px-4 text-sm font-semibold ${mobileMode === "map" ? "bg-background shadow-sm" : ""}`}
          >
            <MapIcon aria-hidden="true" className="size-4" />
            Map
          </button>
          <button
            type="button"
            onClick={() => setMobileMode("plan")}
            aria-pressed={mobileMode === "plan"}
            className={`flex min-h-11 items-center gap-2 rounded px-4 text-sm font-semibold ${mobileMode === "plan" ? "bg-background shadow-sm" : ""}`}
          >
            <List aria-hidden="true" className="size-4" />
            Plan
          </button>
        </div>
      </div>

      <header className="border-border px-5 py-5 sm:px-7">
        <p className="text-muted-foreground font-mono text-[0.625rem] tracking-[0.16em] uppercase">
          Plan map · Version {projection.planVersion}
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1
              id="spatial-itinerary-title"
              className="text-2xl font-semibold tracking-[-0.035em]"
            >
              {itinerary.title}
            </h1>
            {projection.evidenceState === "historical" ? (
              <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
                Viewing Version {projection.planVersion} — evidence as checked
                when this version was published.
              </p>
            ) : null}
          </div>
          <div
            className="flex max-w-full gap-1 overflow-x-auto"
            aria-label="Map day filters"
          >
            <button
              type="button"
              onClick={() => chooseDay("all")}
              aria-pressed={dayFilter === "all"}
              className={`min-h-11 shrink-0 rounded-md px-3 text-xs font-semibold ${dayFilter === "all" ? "bg-foreground text-background" : "border-border border"}`}
            >
              All days
            </button>
            {projection.days.map((day) => (
              <button
                type="button"
                key={day.dayId}
                onClick={() => chooseDay(day.dayId)}
                aria-pressed={dayFilter === day.dayId}
                className={`min-h-11 shrink-0 rounded-md px-3 text-xs font-semibold ${dayFilter === day.dayId ? "bg-foreground text-background" : "border-border border"}`}
              >
                {day.label} · {day.date}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="lg:grid lg:h-[calc(100dvh-13.5rem)] lg:grid-cols-[minmax(0,58fr)_minmax(22rem,42fr)]">
        <div
          id="spatial-itinerary-list"
          role="region"
          aria-label="Plan locations"
          className={`${mobileMode === "map" ? "hidden lg:block" : "block"} min-h-0 overflow-y-auto px-5 pb-32 sm:px-7 lg:pb-8`}
        >
          <div className="border-border border-l pb-8">
            {markers
              .filter((marker) => marker.category !== "destination")
              .map((marker) => {
                const details = marker.itemId
                  ? itemDetails.get(marker.itemId)
                  : undefined;
                const selected = marker.markerId === selectedMarkerId;
                return (
                  <article
                    ref={(node) => {
                      if (node) cardRefs.current.set(marker.markerId, node);
                      else cardRefs.current.delete(marker.markerId);
                    }}
                    tabIndex={-1}
                    aria-label={
                      selected
                        ? `Selected place: ${marker.label}`
                        : `Place: ${marker.label}`
                    }
                    key={marker.markerId}
                    className={`relative ml-5 border-b py-5 outline-none ${selected ? "border-foreground" : "border-border"}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute top-6 -left-[2.05rem] flex size-6 items-center justify-center rounded-full border text-[0.625rem] font-semibold ${selected ? "bg-foreground text-background border-foreground" : "bg-background border-foreground"}`}
                    >
                      {marker.shortLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => selectFromList(marker.markerId)}
                      className="focus-visible:ring-ring w-full rounded-sm text-left focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-muted-foreground font-mono text-[0.625rem]">
                            {marker.timeLabel ?? "Open time"}
                          </p>
                          <h2 className="mt-1 font-semibold">{marker.label}</h2>
                        </div>
                        <MapPin
                          aria-hidden="true"
                          className="text-muted-foreground mt-1 size-4 shrink-0"
                        />
                      </div>
                      {details?.description ? (
                        <p className="text-muted-foreground mt-2 text-sm leading-6">
                          {details.description}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2 text-[0.6875rem]">
                        <span className="border-border rounded-full border px-2 py-1">
                          {markerStatus(marker)}
                        </span>
                        {marker.warningTypes.map((warning) => (
                          <span
                            key={warning}
                            className="border-foreground flex items-center gap-1 rounded-full border px-2 py-1"
                          >
                            <AlertTriangle
                              aria-hidden="true"
                              className="size-3"
                            />
                            {warning.replaceAll("_", " ")}
                          </span>
                        ))}
                      </div>
                    </button>
                    {marker.warningTypes.length > 0 && onViewEvidence ? (
                      <button
                        type="button"
                        onClick={onViewEvidence}
                        className="border-border mt-3 min-h-11 rounded-md border px-3 text-xs font-semibold"
                      >
                        View warning evidence
                      </button>
                    ) : null}
                  </article>
                );
              })}
          </div>
          <section className="border-border border-t py-6">
            <div className="flex items-center gap-2">
              <Route aria-hidden="true" className="size-4" />
              <h2 className="font-semibold">Route details</h2>
            </div>
            {routes.length ? (
              <ul className="mt-3 space-y-3">
                {routes.map((segment) => (
                  <li key={segment.segmentId} className="text-sm">
                    <p className="font-semibold capitalize">
                      {routeLabel(segment)}
                    </p>
                    <p className="text-muted-foreground mt-1">
                      {segment.geometryState === "verified_geometry"
                        ? "Verified route geometry"
                        : segment.geometryState === "endpoint_only"
                          ? "Route endpoints only — no path is drawn"
                          : "Route unavailable — no path is drawn"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground mt-3 text-sm">
                No route segments are available for this day.
              </p>
            )}
          </section>
        </div>

        <div
          role="region"
          aria-label="Itinerary map"
          className={`${mobileMode === "plan" ? "hidden lg:block" : "block"} border-border bg-subtle relative min-h-[58dvh] overflow-hidden border-t lg:min-h-0 lg:border-t-0 lg:border-l`}
        >
          {mapUnavailable ? (
            <div className="flex h-full min-h-[30rem] flex-col items-center justify-center p-8 text-center">
              <MapIcon
                aria-hidden="true"
                className="text-muted-foreground size-6"
              />
              <p className="mt-4 max-w-sm font-semibold">
                Map view is unavailable. Your itinerary is still fully
                accessible.
              </p>
              {!online ? (
                <p className="text-muted-foreground mt-2 max-w-sm text-sm">
                  You appear to be offline.
                </p>
              ) : projection.markers.every(
                  (marker) => marker.coordinates === null,
                ) ? (
                <p className="text-muted-foreground mt-2 max-w-sm text-sm">
                  Location details are not available for this Plan.
                </p>
              ) : null}
              {projection.privacyMode === "public_share" &&
              projection.markers.some(
                (marker) => marker.privacyLevel === "omitted",
              ) ? (
                <p className="text-muted-foreground mt-2 max-w-sm text-sm">
                  Some private locations are hidden from this shared map.
                </p>
              ) : null}
            </div>
          ) : (
            <MapCanvas
              configuration={configuration}
              projection={projection}
              markers={markers}
              routeSegments={routes}
              selectedMarkerId={selectedMarkerId}
              onSelectMarker={selectFromMap}
              onUnavailable={() => setSdkUnavailable(true)}
              reducedMotion={
                typeof window !== "undefined" &&
                typeof window.matchMedia === "function" &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches
              }
              emphasizedMarkerIds={emphasizedMarkerIds}
            />
          )}
        </div>
      </div>

      {compareAnnotations.length ? (
        <aside className="border-border bg-background absolute top-36 right-4 z-10 hidden w-64 rounded-md border p-4 shadow-lg lg:block">
          <p className="font-mono text-[0.625rem] tracking-[0.14em] uppercase">
            Spatial changes
          </p>
          <ul className="mt-3 space-y-2 text-xs">
            {compareAnnotations.map((annotation) => (
              <li key={annotation.annotationId}>
                <span className="font-semibold capitalize">
                  {annotation.kind.replaceAll("_", " ")}
                </span>
                <span className="text-muted-foreground ml-1">
                  {annotation.label}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      {mobileMode === "map" ? (
        <aside
          data-testid="place-sheet"
          data-position={sheetPosition}
          aria-label="Selected place sheet"
          className={`bg-background border-border fixed inset-x-0 bottom-16 z-20 rounded-t-xl border-t px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl transition-[height] motion-reduce:transition-none lg:hidden ${
            sheetPosition === "expanded"
              ? "h-[78dvh] overflow-y-auto"
              : sheetPosition === "half"
                ? "h-[44dvh] overflow-y-auto"
                : "h-28"
          }`}
        >
          <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3">
            <button
              type="button"
              aria-label="Collapse place sheet"
              disabled={sheetPosition === "collapsed"}
              onClick={() =>
                setSheetPosition(previousSheetPosition(sheetPosition))
              }
              className="border-border flex size-11 items-center justify-center rounded-md border disabled:opacity-40"
            >
              <ChevronDown aria-hidden="true" className="size-4" />
            </button>
            <div className="min-w-0 text-center">
              <p className="truncate text-sm font-semibold">
                {selectedMarker?.label ?? "Choose a place"}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {selectedMarker
                  ? markerStatus(selectedMarker)
                  : "Tap a marker or itinerary item"}
              </p>
            </div>
            <button
              type="button"
              aria-label="Expand place sheet"
              disabled={sheetPosition === "expanded"}
              onClick={() => setSheetPosition(nextSheetPosition(sheetPosition))}
              className="border-border flex size-11 items-center justify-center rounded-md border disabled:opacity-40"
            >
              <ChevronUp aria-hidden="true" className="size-4" />
            </button>
          </div>
          {sheetPosition !== "collapsed" ? (
            <div className="mx-auto mt-5 w-full max-w-lg">
              <button
                type="button"
                onClick={() => setMobileMode("plan")}
                className="border-border min-h-11 w-full rounded-md border px-4 text-sm font-semibold"
              >
                View itinerary list
              </button>
            </div>
          ) : null}
        </aside>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {selectedMarker ? `${selectedMarker.label} selected` : ""}
      </p>
    </section>
  );
}
