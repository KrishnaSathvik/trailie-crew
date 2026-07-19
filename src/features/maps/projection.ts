import {
  itineraryMapProjectionV1Schema,
  itineraryMapRouteSegmentV1Schema,
  type CanonicalDestinationResolutionV1,
  type Itinerary,
  type ItineraryMapMarkerV1,
  type ItineraryMapProjectionV1,
  type ItineraryMapRouteSegmentV1,
  type MapCoordinateSource,
  type MapPrivacyLevel,
  type MapWarningType,
  type TravelEvidenceV1,
  type TravelEvidenceSnapshotV1,
  type TravelFreshnessState,
} from "@trailie/schemas";

type ProjectionEvidence = TravelEvidenceV1 | TravelEvidenceSnapshotV1;

type ProjectionInput = Readonly<{
  roomId: string;
  planVersionId: string;
  planVersion: number;
  itinerary: Itinerary;
  evidence: readonly ProjectionEvidence[];
  evidenceBindings?: readonly Readonly<{
    evidenceId: string;
    targetItemId: string | null;
  }>[];
  destinationResolution: CanonicalDestinationResolutionV1 | null;
  privacyMode: "member" | "public_share";
  publishedAt: string;
  historical: boolean;
  generatedAt: string;
}>;

export type SpatialCompareAnnotation = Readonly<{
  annotationId: string;
  kind: "added" | "removed" | "moved" | "route_changed" | "warning_changed";
  markerId: string | null;
  segmentId: string | null;
  label: string;
}>;

const sourcePriority: Record<string, number> = {
  nps: 0,
  ridb: 1,
  permanent_provider: 2,
};

function evidenceLocation(item: ProjectionEvidence | undefined) {
  if (!item) return null;
  return "locationBinding" in item ? item.locationBinding : null;
}

function evidenceEntity(item: ProjectionEvidence | undefined) {
  if (!item) return null;
  return "entityBinding" in item ? item.entityBinding : null;
}

function evidenceCoordinates(item: ProjectionEvidence | undefined) {
  if (!item || item.restrictions.storage === "prohibited") return null;
  const binding = evidenceLocation(item)?.coordinates;
  if (binding) return binding;
  const data = item.normalizedValue.data;
  const coordinates =
    typeof data.coordinates === "object" &&
    data.coordinates !== null &&
    !Array.isArray(data.coordinates)
      ? (data.coordinates as Record<string, unknown>)
      : null;
  const latitude = coordinates?.latitude ?? data.latitude;
  const longitude = coordinates?.longitude ?? data.longitude;
  return typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
    ? { latitude, longitude }
    : null;
}

function safeEvidence(evidence: readonly ProjectionEvidence[]) {
  return evidence.filter(
    (item) =>
      item.restrictions.storage !== "prohibited" &&
      (evidenceCoordinates(item) !== null || item.evidenceType === "route"),
  );
}

function coordinateSource(
  item: ProjectionEvidence,
): MapCoordinateSource | null {
  if (item.provider === "nps") return "official_nps";
  if (item.provider === "ridb") return "official_ridb";
  if (item.restrictions.storage === "permanent")
    return "approved_permanent_provider";
  return null;
}

function evidenceForEntity(
  evidence: readonly ProjectionEvidence[],
  entityId: string,
  bindings: ProjectionInput["evidenceBindings"] = [],
) {
  return evidence
    .filter(
      (item) =>
        (evidenceEntity(item)?.canonicalId === entityId ||
          bindings.some(
            (binding) =>
              binding.evidenceId === item.evidenceId &&
              binding.targetItemId === entityId,
          )) &&
        coordinateSource(item) !== null,
    )
    .sort((left, right) => {
      const leftKey =
        left.provider === "nps"
          ? "nps"
          : left.provider === "ridb"
            ? "ridb"
            : "permanent_provider";
      const rightKey =
        right.provider === "nps"
          ? "nps"
          : right.provider === "ridb"
            ? "ridb"
            : "permanent_provider";
      return sourcePriority[leftKey]! - sourcePriority[rightKey]!;
    })[0];
}

function privacyLevel(
  evidence: ProjectionEvidence | undefined,
  category: ItineraryMapMarkerV1["category"],
  mode: ProjectionInput["privacyMode"],
): MapPrivacyLevel {
  const privateLocation =
    category === "lodging" ||
    evidenceLocation(evidence)?.privacy === "private" ||
    evidenceLocation(evidence)?.privacy === "sensitive";
  if (!privateLocation) return "public";
  return mode === "public_share" ? "omitted" : "exact_private";
}

function formatTime(time: string | null) {
  if (time === null) return null;
  const [hourString, minute] = time.split(":");
  const hour = Number(hourString);
  if (!Number.isInteger(hour) || minute === undefined) return time;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function warningsForEvidence(
  evidence: readonly ProjectionEvidence[],
): MapWarningType[] {
  const warnings = new Set<MapWarningType>();
  for (const item of evidence) {
    if (item.evidenceType === "park_closure") warnings.add("official_closure");
    if (item.evidenceType === "severe_weather") warnings.add("severe_weather");
    if (item.freshnessState === "stale" || item.freshnessState === "expired")
      warnings.add("stale_evidence");
    if (item.availabilityState === "ambiguous") warnings.add("ambiguous_place");
  }
  return [...warnings];
}

function markerForEntity(input: {
  entityId: string;
  dayId: string | null;
  sequence: number;
  category: ItineraryMapMarkerV1["category"];
  label: string;
  shortLabel: string;
  time: string | null;
  evidence: readonly ProjectionEvidence[];
  privacyMode: ProjectionInput["privacyMode"];
  evidenceBindings?: ProjectionInput["evidenceBindings"];
}): ItineraryMapMarkerV1 {
  const matching = input.evidence.filter(
    (item) =>
      evidenceEntity(item)?.canonicalId === input.entityId ||
      input.evidenceBindings?.some(
        (binding) =>
          binding.evidenceId === item.evidenceId &&
          binding.targetItemId === input.entityId,
      ),
  );
  const selected = evidenceForEntity(
    input.evidence,
    input.entityId,
    input.evidenceBindings,
  );
  const privacy = privacyLevel(selected, input.category, input.privacyMode);
  const coordinates =
    privacy === "omitted" ? null : evidenceCoordinates(selected);
  return {
    markerId: `marker:${input.entityId}`,
    itemId: input.entityId,
    dayId: input.dayId,
    sequence: input.sequence,
    category: input.category,
    label: input.label,
    shortLabel: input.shortLabel,
    coordinates,
    coordinateSource:
      coordinates === null
        ? "unavailable"
        : (coordinateSource(selected!) ?? "unavailable"),
    verificationState:
      coordinates === null ? "unverified" : selected!.verificationState,
    freshnessState:
      coordinates === null ? "unavailable" : selected!.freshnessState,
    privacyLevel: privacy,
    warningTypes: warningsForEvidence(matching),
    timeLabel: formatTime(input.time),
    clusterGroup: input.dayId,
  };
}

function markerCategory(type: string): ItineraryMapMarkerV1["category"] {
  if (type === "food") return "food";
  if (type === "lodging") return "lodging";
  if (type === "transport") return "airport_station";
  return "activity";
}

function routeMode(mode: string): ItineraryMapRouteSegmentV1["mode"] {
  if (mode === "drive") return "driving";
  if (mode === "walk") return "walking";
  if (mode === "bike") return "cycling";
  if (mode === "transit") return "transit";
  if (mode === "shuttle") return "shuttle";
  return "unknown";
}

function storedGeometry(item: ProjectionEvidence | undefined) {
  if (!item || item.verificationState !== "verified") return null;
  const candidate = item.normalizedValue.data.geometry;
  const parsed =
    itineraryMapRouteSegmentV1Schema.shape.geometry.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function routeSegment(
  dayId: string,
  segment: Itinerary["days"][number]["travelSegments"][number],
  evidence: readonly ProjectionEvidence[],
  evidenceBindings: ProjectionInput["evidenceBindings"] = [],
): ItineraryMapRouteSegmentV1 {
  const routeEvidence = evidence.find(
    (item) =>
      item.evidenceType === "route" &&
      (evidenceEntity(item)?.canonicalId === segment.id ||
        segment.evidenceRefs.includes(item.evidenceId) ||
        evidenceBindings.some(
          (binding) =>
            binding.evidenceId === item.evidenceId &&
            binding.targetItemId === segment.id,
        )),
  );
  const geometry = storedGeometry(routeEvidence);
  const hasEndpoints = segment.fromItemId !== null && segment.toItemId !== null;
  return {
    segmentId: segment.id,
    dayId,
    fromMarkerId: `marker:${segment.fromItemId ?? `${segment.id}:origin`}`,
    toMarkerId: `marker:${segment.toItemId ?? `${segment.id}:destination`}`,
    mode: routeMode(segment.mode),
    distanceMeters:
      routeEvidence?.normalizedValue.data.distanceMeters &&
      typeof routeEvidence.normalizedValue.data.distanceMeters === "number"
        ? Math.round(routeEvidence.normalizedValue.data.distanceMeters)
        : segment.distanceMeters,
    durationMinutes:
      routeEvidence?.normalizedValue.data.durationMinutes &&
      typeof routeEvidence.normalizedValue.data.durationMinutes === "number"
        ? Math.round(routeEvidence.normalizedValue.data.durationMinutes)
        : segment.durationMinutes,
    geometry,
    geometryState:
      geometry !== null
        ? "verified_geometry"
        : hasEndpoints
          ? "endpoint_only"
          : "unavailable",
    verificationState:
      geometry !== null
        ? "verified"
        : (routeEvidence?.verificationState ?? "unverified"),
    freshnessState:
      routeEvidence?.freshnessState ??
      (hasEndpoints ? "unavailable" : "unavailable"),
    warningTypes:
      routeEvidence === undefined
        ? ["route_unavailable"]
        : warningsForEvidence([routeEvidence]),
  };
}

function visibleBounds(markers: readonly ItineraryMapMarkerV1[]) {
  const points = markers.flatMap((marker) =>
    marker.coordinates === null ? [] : [marker.coordinates],
  );
  if (points.length === 0) return null;
  return [
    Math.min(...points.map((point) => point.longitude)),
    Math.min(...points.map((point) => point.latitude)),
    Math.max(...points.map((point) => point.longitude)),
    Math.max(...points.map((point) => point.latitude)),
  ] as [number, number, number, number];
}

function aggregateFreshness(
  evidence: readonly ProjectionEvidence[],
  historical: boolean,
): ItineraryMapProjectionV1["evidenceState"] {
  if (historical) return "historical";
  if (evidence.length === 0) return "unavailable";
  const states = new Set<TravelFreshnessState>(
    evidence.map((item) => item.freshnessState),
  );
  if (states.size > 1) return "mixed";
  const only = [...states][0];
  if (only === "fresh" || only === "cached_fresh") return "fresh";
  if (only === "stale" || only === "expired") return "stale";
  return "unavailable";
}

function redactPublicProjection(
  projection: ItineraryMapProjectionV1,
): ItineraryMapProjectionV1 {
  const omittedMarkerIds = new Set(
    projection.markers
      .filter((marker) => marker.privacyLevel === "omitted")
      .map((marker) => marker.markerId),
  );
  const dayIds = new Map(
    projection.days.map((day, index) => [day.dayId, `day:public:${index + 1}`]),
  );
  const markerIds = new Map(
    projection.markers.map((marker, index) => [
      marker.markerId,
      `marker:public:${index + 1}`,
    ]),
  );
  const segmentIds = new Map(
    projection.routeSegments.map((segment, index) => [
      segment.segmentId,
      `segment:public:${index + 1}`,
    ]),
  );
  return {
    ...projection,
    roomId: "public-share",
    planVersionId: `public-version-${projection.planVersion}`,
    days: projection.days.map((day) => ({
      ...day,
      dayId: dayIds.get(day.dayId)!,
      markerIds: day.markerIds.flatMap((id) => markerIds.get(id) ?? []),
      routeSegmentIds: day.routeSegmentIds.flatMap(
        (id) => segmentIds.get(id) ?? [],
      ),
    })),
    markers: projection.markers.map((marker) => ({
      ...marker,
      markerId: markerIds.get(marker.markerId)!,
      itemId: null,
      dayId: marker.dayId === null ? null : (dayIds.get(marker.dayId) ?? null),
      clusterGroup:
        marker.clusterGroup === null
          ? null
          : (dayIds.get(marker.clusterGroup) ?? "public:other"),
    })),
    routeSegments: projection.routeSegments.map((segment) => ({
      ...segment,
      segmentId: segmentIds.get(segment.segmentId)!,
      dayId: dayIds.get(segment.dayId)!,
      fromMarkerId:
        markerIds.get(segment.fromMarkerId) ?? "marker:public:unavailable",
      toMarkerId:
        markerIds.get(segment.toMarkerId) ?? "marker:public:unavailable",
      geometry:
        omittedMarkerIds.has(segment.fromMarkerId) ||
        omittedMarkerIds.has(segment.toMarkerId)
          ? null
          : segment.geometry,
      geometryState:
        omittedMarkerIds.has(segment.fromMarkerId) ||
        omittedMarkerIds.has(segment.toMarkerId)
          ? "prohibited"
          : segment.geometryState,
    })),
    warnings: projection.warnings.map((warning, index) => ({
      ...warning,
      warningId: `warning:public:${index + 1}`,
      markerId:
        warning.markerId === null
          ? null
          : (markerIds.get(warning.markerId) ?? null),
      segmentId:
        warning.segmentId === null
          ? null
          : (segmentIds.get(warning.segmentId) ?? null),
      evidenceId: null,
    })),
  };
}

export function buildItineraryMapProjection(
  input: ProjectionInput,
): ItineraryMapProjectionV1 {
  const evidence = safeEvidence(input.evidence);
  const markers: ItineraryMapMarkerV1[] = [];
  const resolution = input.destinationResolution;
  const destinationCoordinates =
    resolution?.status === "resolved" ? resolution.coordinates : null;
  const destinationSource: MapCoordinateSource =
    destinationCoordinates === null
      ? "unavailable"
      : resolution?.npsParkCode
        ? "official_nps"
        : "approved_permanent_provider";
  markers.push({
    markerId: "marker:destination",
    itemId: null,
    dayId: null,
    sequence: 0,
    category: "destination",
    label: resolution?.canonicalName ?? input.itinerary.destinationSummary,
    shortLabel: "D",
    coordinates: destinationCoordinates,
    coordinateSource: destinationSource,
    verificationState:
      destinationCoordinates === null ? "unverified" : "verified",
    freshnessState: destinationCoordinates === null ? "unavailable" : "fresh",
    privacyLevel: "public",
    warningTypes: resolution?.status === "ambiguous" ? ["ambiguous_place"] : [],
    timeLabel: null,
    clusterGroup: null,
  });

  const routeSegments: ItineraryMapRouteSegmentV1[] = [];
  const days = input.itinerary.days.map((day, dayIndex) => {
    const dayMarkerIds: string[] = [];
    for (const [itemIndex, item] of day.items.entries()) {
      const marker = markerForEntity({
        entityId: item.id,
        dayId: day.id,
        sequence: itemIndex + 1,
        category: markerCategory(item.type),
        label: item.title,
        shortLabel: String(itemIndex + 1),
        time: item.startTime,
        evidence,
        privacyMode: input.privacyMode,
        evidenceBindings: input.evidenceBindings,
      });
      markers.push(marker);
      dayMarkerIds.push(marker.markerId);
    }
    const dayRoutes = day.travelSegments.map((segment) =>
      routeSegment(day.id, segment, evidence, input.evidenceBindings),
    );
    routeSegments.push(...dayRoutes);
    return {
      dayId: day.id,
      date: day.date,
      label: `Day ${dayIndex + 1}`,
      markerIds: dayMarkerIds,
      routeSegmentIds: dayRoutes.map((segment) => segment.segmentId),
    };
  });

  for (const [index, lodging] of input.itinerary.lodging.entries())
    markers.push(
      markerForEntity({
        entityId: lodging.id,
        dayId: null,
        sequence: index + 1,
        category: "lodging",
        label: lodging.name,
        shortLabel: "L",
        time: null,
        evidence,
        privacyMode: input.privacyMode,
        evidenceBindings: input.evidenceBindings,
      }),
    );
  for (const [index, restaurant] of input.itinerary.restaurants.entries())
    markers.push(
      markerForEntity({
        entityId: restaurant.id,
        dayId: null,
        sequence: index + 1,
        category: "food",
        label: restaurant.name,
        shortLabel: "F",
        time: null,
        evidence,
        privacyMode: input.privacyMode,
        evidenceBindings: input.evidenceBindings,
      }),
    );

  const warnings = evidence.flatMap((item) =>
    warningsForEvidence([item]).map((type) => ({
      warningId: `warning:${item.evidenceId}:${type}`,
      type,
      label:
        type === "official_closure"
          ? "Official closure"
          : type === "severe_weather"
            ? "Severe weather caution"
            : type === "stale_evidence"
              ? "Evidence is stale"
              : "Location needs review",
      markerId: evidenceEntity(item)
        ? `marker:${evidenceEntity(item)!.canonicalId}`
        : null,
      segmentId:
        evidenceEntity(item)?.entityType === "route_segment"
          ? evidenceEntity(item)!.canonicalId
          : null,
      evidenceId: item.evidenceId,
    })),
  );
  const destinationBounds = resolution?.boundingBox ?? null;
  const markerBounds = visibleBounds(markers);
  const projection = itineraryMapProjectionV1Schema.parse({
    schemaVersion: "1",
    roomId: input.roomId,
    planVersionId: input.planVersionId,
    planVersion: input.planVersion,
    destination: {
      label: resolution?.canonicalName ?? input.itinerary.destinationSummary,
      coordinates: destinationCoordinates,
      bounds: destinationBounds,
      coordinateSource: destinationSource,
    },
    viewport: {
      bounds: destinationBounds ?? markerBounds,
      source:
        destinationBounds !== null
          ? "destination_bounds"
          : markerBounds !== null
            ? "visible_markers"
            : "unavailable",
    },
    days,
    markers,
    routeSegments,
    warnings,
    privacyMode: input.privacyMode,
    evidenceState: aggregateFreshness(evidence, input.historical),
    generatedAt: input.generatedAt,
  });
  return input.privacyMode === "public_share"
    ? itineraryMapProjectionV1Schema.parse(redactPublicProjection(projection))
    : projection;
}

function sameCoordinates(
  left: ItineraryMapMarkerV1["coordinates"],
  right: ItineraryMapMarkerV1["coordinates"],
) {
  return (
    left?.latitude === right?.latitude && left?.longitude === right?.longitude
  );
}

export function buildSpatialCompareAnnotations(
  base: ItineraryMapProjectionV1,
  next: ItineraryMapProjectionV1,
): SpatialCompareAnnotation[] {
  const annotations: SpatialCompareAnnotation[] = [];
  const baseMarkers = new Map(
    base.markers.map((marker) => [marker.markerId, marker]),
  );
  const nextMarkers = new Map(
    next.markers.map((marker) => [marker.markerId, marker]),
  );
  for (const marker of next.markers) {
    const previous = baseMarkers.get(marker.markerId);
    if (!previous)
      annotations.push({
        annotationId: `added:${marker.markerId}`,
        kind: "added",
        markerId: marker.markerId,
        segmentId: null,
        label: `${marker.label} added`,
      });
    else if (!sameCoordinates(previous.coordinates, marker.coordinates))
      annotations.push({
        annotationId: `moved:${marker.markerId}`,
        kind: "moved",
        markerId: marker.markerId,
        segmentId: null,
        label: `${marker.label} moved`,
      });
    else if (previous.warningTypes.join("|") !== marker.warningTypes.join("|"))
      annotations.push({
        annotationId: `warning:${marker.markerId}`,
        kind: "warning_changed",
        markerId: marker.markerId,
        segmentId: null,
        label: `${marker.label} warning changed`,
      });
  }
  for (const marker of base.markers)
    if (!nextMarkers.has(marker.markerId))
      annotations.push({
        annotationId: `removed:${marker.markerId}`,
        kind: "removed",
        markerId: marker.markerId,
        segmentId: null,
        label: `${marker.label} removed`,
      });

  const baseRoutes = new Map(
    base.routeSegments.map((segment) => [segment.segmentId, segment]),
  );
  for (const segment of next.routeSegments) {
    const previous = baseRoutes.get(segment.segmentId);
    if (
      previous &&
      JSON.stringify(previous.geometry) !== JSON.stringify(segment.geometry)
    )
      annotations.push({
        annotationId: `route:${segment.segmentId}`,
        kind: "route_changed",
        markerId: null,
        segmentId: segment.segmentId,
        label: "Route changed",
      });
  }
  return annotations;
}
