"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import { useEffect, useMemo, useRef, useState } from "react";
import type mapboxgl from "mapbox-gl";
import type { MapCanvasProps } from "./map-workspace";

const routeSourceId = "trailie-versioned-routes";
const markerSourceId = "trailie-versioned-markers";
const routeModes = [
  { mode: "driving", dash: [1, 0] },
  { mode: "walking", dash: [2, 2] },
  { mode: "cycling", dash: [6, 2] },
  { mode: "transit", dash: [1, 2] },
  { mode: "shuttle", dash: [4, 2] },
  { mode: "unknown", dash: [1, 3] },
] as const;

function routeCollection(routeSegments: MapCanvasProps["routeSegments"]) {
  return {
    type: "FeatureCollection" as const,
    features: routeSegments.flatMap((segment) =>
      segment.geometryState === "verified_geometry" && segment.geometry !== null
        ? [
            {
              type: "Feature" as const,
              properties: {
                segmentId: segment.segmentId,
                mode: segment.mode,
              },
              geometry: segment.geometry,
            },
          ]
        : [],
    ),
  };
}

function markerCollection(markers: MapCanvasProps["markers"]) {
  return {
    type: "FeatureCollection" as const,
    features: markers.flatMap((marker) =>
      marker.coordinates !== null && marker.privacyLevel !== "omitted"
        ? [
            {
              type: "Feature" as const,
              properties: {
                markerId: marker.markerId,
                shortLabel: marker.shortLabel,
              },
              geometry: {
                type: "Point" as const,
                coordinates: [
                  marker.coordinates.longitude,
                  marker.coordinates.latitude,
                ],
              },
            },
          ]
        : [],
    ),
  };
}

function addRouteLayers(map: mapboxgl.Map) {
  for (const route of routeModes) {
    const layerId = `trailie-route-${route.mode}`;
    if (map.getLayer(layerId)) continue;
    map.addLayer({
      id: layerId,
      type: "line",
      source: routeSourceId,
      filter: ["==", ["get", "mode"], route.mode],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#171717",
        "line-width": route.mode === "driving" ? 3 : 2.25,
        "line-opacity": route.mode === "unknown" ? 0.45 : 0.78,
        "line-dasharray": [...route.dash],
      },
    });
  }
}

export function MapboxCanvas({
  configuration,
  projection,
  markers,
  routeSegments,
  selectedMarkerId,
  onSelectMarker,
  onUnavailable,
  reducedMotion,
  emphasizedMarkerIds = [],
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const sdkRef = useRef<typeof mapboxgl | null>(null);
  const markerRefs = useRef<mapboxgl.Marker[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const selectRef = useRef(onSelectMarker);
  const unavailableRef = useRef(onUnavailable);
  const routesRef = useRef(routeSegments);
  const markersRef = useRef(markers);
  const emphasizedMarkerSet = useMemo(
    () => new Set(emphasizedMarkerIds),
    [emphasizedMarkerIds],
  );
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    selectRef.current = onSelectMarker;
    unavailableRef.current = onUnavailable;
    routesRef.current = routeSegments;
    markersRef.current = markers;
  }, [markers, onSelectMarker, onUnavailable, routeSegments]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      if (
        !configuration.enabled ||
        configuration.browserToken === null ||
        !containerRef.current
      )
        return;
      try {
        const mapboxModule = await import("mapbox-gl");
        if (!active || !containerRef.current) return;
        const mapbox = mapboxModule.default;
        sdkRef.current = mapbox;
        mapbox.accessToken = configuration.browserToken;
        const center = projection.destination.coordinates;
        const map = new mapbox.Map({
          container: containerRef.current,
          style: configuration.styleUrl,
          center: center
            ? [center.longitude, center.latitude]
            : [-98.5795, 39.8283],
          zoom: center ? 8 : 3,
          attributionControl: true,
          cooperativeGestures: true,
          pitchWithRotate: false,
          dragRotate: false,
          touchPitch: false,
          maxPitch: 0,
          minZoom: 2,
          maxZoom: 18,
        });
        mapRef.current = map;
        map.addControl(
          new mapbox.NavigationControl({
            showCompass: false,
            visualizePitch: false,
          }),
          "top-right",
        );
        map.on("error", () => {
          if (active && !map.loaded()) unavailableRef.current();
        });
        map.once("load", () => {
          if (!active) return;
          if (!map.getSource(routeSourceId))
            map.addSource(routeSourceId, {
              type: "geojson",
              data: routeCollection(routesRef.current),
            });
          if (!map.getSource(markerSourceId))
            map.addSource(markerSourceId, {
              type: "geojson",
              data:
                markersRef.current.length > 40
                  ? markerCollection(markersRef.current)
                  : markerCollection([]),
              cluster: true,
              clusterMaxZoom: 14,
              clusterRadius: 42,
            });
          addRouteLayers(map);
          if (!map.getLayer("trailie-marker-clusters"))
            map.addLayer({
              id: "trailie-marker-clusters",
              type: "circle",
              source: markerSourceId,
              filter: ["has", "point_count"],
              paint: {
                "circle-color": "#f7f7f5",
                "circle-stroke-color": "#171717",
                "circle-stroke-width": 2,
                "circle-radius": 17,
              },
            });
          if (!map.getLayer("trailie-marker-cluster-count"))
            map.addLayer({
              id: "trailie-marker-cluster-count",
              type: "symbol",
              source: markerSourceId,
              filter: ["has", "point_count"],
              layout: {
                "text-field": ["get", "point_count_abbreviated"],
                "text-size": 11,
              },
              paint: { "text-color": "#171717" },
            });
          if (!map.getLayer("trailie-unclustered-markers"))
            map.addLayer({
              id: "trailie-unclustered-markers",
              type: "circle",
              source: markerSourceId,
              filter: ["!", ["has", "point_count"]],
              paint: {
                "circle-color": "#171717",
                "circle-radius": 13,
                "circle-stroke-color": "#f7f7f5",
                "circle-stroke-width": 2,
              },
            });
          if (!map.getLayer("trailie-unclustered-labels"))
            map.addLayer({
              id: "trailie-unclustered-labels",
              type: "symbol",
              source: markerSourceId,
              filter: ["!", ["has", "point_count"]],
              layout: {
                "text-field": ["get", "shortLabel"],
                "text-size": 10,
              },
              paint: { "text-color": "#f7f7f5" },
            });
          map.on("click", "trailie-marker-clusters", (event) => {
            const feature = event.features?.[0];
            const clusterId = feature?.properties?.cluster_id;
            if (
              typeof clusterId !== "number" ||
              feature?.geometry.type !== "Point"
            )
              return;
            const source = map.getSource(
              markerSourceId,
            ) as mapboxgl.GeoJSONSource;
            const coordinates = feature.geometry.coordinates as [
              number,
              number,
            ];
            source.getClusterExpansionZoom(clusterId, (error, zoom) => {
              if (error || zoom === undefined || zoom === null) return;
              map.easeTo({
                center: coordinates,
                zoom,
                duration: reducedMotion ? 0 : 300,
              });
            });
          });
          map.on("click", "trailie-unclustered-markers", (event) => {
            const markerId = event.features?.[0]?.properties?.markerId;
            if (typeof markerId === "string") selectRef.current(markerId);
          });
          for (const layer of [
            "trailie-marker-clusters",
            "trailie-unclustered-markers",
          ]) {
            map.on("mouseenter", layer, () => {
              map.getCanvas().style.cursor = "pointer";
            });
            map.on("mouseleave", layer, () => {
              map.getCanvas().style.cursor = "";
            });
          }
          setLoaded(true);
          if (projection.viewport.bounds) {
            map.fitBounds(
              [
                [projection.viewport.bounds[0], projection.viewport.bounds[1]],
                [projection.viewport.bounds[2], projection.viewport.bounds[3]],
              ],
              {
                padding: 56,
                duration: reducedMotion ? 0 : 450,
                maxZoom: 13,
              },
            );
          }
        });
      } catch {
        if (active) unavailableRef.current();
      }
    }
    void initialize();
    return () => {
      active = false;
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      sdkRef.current = null;
      setLoaded(false);
    };
  }, [
    configuration.browserToken,
    configuration.enabled,
    configuration.styleUrl,
    projection.planVersion,
    projection.destination.coordinates,
    projection.viewport.bounds,
    reducedMotion,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const mapbox = sdkRef.current;
    if (!map || !mapbox || !loaded) return;
    const source = map.getSource(routeSourceId) as
      mapboxgl.GeoJSONSource | undefined;
    source?.setData(routeCollection(routeSegments));
  }, [loaded, routeSegments]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const source = map.getSource(markerSourceId) as
      mapboxgl.GeoJSONSource | undefined;
    source?.setData(
      markers.length > 40 ? markerCollection(markers) : markerCollection([]),
    );
  }, [loaded, markers]);

  useEffect(() => {
    const map = mapRef.current;
    const mapbox = sdkRef.current;
    if (!map || !mapbox || !loaded) return;
    markerRefs.current.forEach((marker) => marker.remove());
    if (markers.length > 40) {
      markerRefs.current = [];
      return;
    }
    markerRefs.current = markers.flatMap((marker) => {
      if (marker.coordinates === null || marker.privacyLevel === "omitted")
        return [];
      const element = document.createElement("button");
      element.type = "button";
      element.className = [
        "trailie-map-marker",
        marker.markerId === selectedMarkerId ? "is-selected" : "",
        emphasizedMarkerIds.length > 0 &&
        !emphasizedMarkerSet.has(marker.markerId)
          ? "is-subdued"
          : "",
        emphasizedMarkerSet.has(marker.markerId) ? "is-compared" : "",
      ]
        .filter(Boolean)
        .join(" ");
      element.setAttribute(
        "aria-label",
        `${marker.label}. ${marker.verificationState} location.`,
      );
      const number = document.createElement("span");
      number.textContent = marker.shortLabel;
      number.setAttribute("aria-hidden", "true");
      element.append(number);
      element.addEventListener("click", () => {
        selectRef.current(marker.markerId);
        popupRef.current?.remove();
        const popupContent = document.createElement("div");
        const title = document.createElement("p");
        title.className = "trailie-map-popup-title";
        title.textContent = marker.label;
        const details = document.createElement("p");
        details.textContent = [
          marker.timeLabel,
          marker.category.replaceAll("_", " "),
          marker.verificationState.replaceAll("_", " "),
        ]
          .filter(Boolean)
          .join(" · ");
        popupContent.append(title, details);
        popupRef.current = new mapbox.Popup({
          closeButton: true,
          closeOnClick: true,
          focusAfterOpen: false,
          offset: 18,
        })
          .setDOMContent(popupContent)
          .setLngLat([
            marker.coordinates!.longitude,
            marker.coordinates!.latitude,
          ])
          .addTo(map);
      });
      return [
        new mapbox.Marker({ element, anchor: "center" })
          .setLngLat([
            marker.coordinates.longitude,
            marker.coordinates.latitude,
          ])
          .addTo(map),
      ];
    });
  }, [
    emphasizedMarkerIds,
    emphasizedMarkerSet,
    loaded,
    markers,
    selectedMarkerId,
  ]);

  useEffect(() => {
    const selected = markers.find(
      (marker) =>
        marker.markerId === selectedMarkerId && marker.coordinates !== null,
    );
    if (!selected?.coordinates || !mapRef.current) return;
    mapRef.current.easeTo({
      center: [selected.coordinates.longitude, selected.coordinates.latitude],
      duration: reducedMotion ? 0 : 350,
      zoom: Math.max(mapRef.current.getZoom(), 12),
    });
  }, [markers, reducedMotion, selectedMarkerId]);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-[30rem] w-full"
      aria-label={`Interactive itinerary map for Version ${projection.planVersion}`}
    />
  );
}
