import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ComponentProps } from "react";
import type { MapConfiguration } from "../config";
import { buildItineraryMapProjection } from "../projection";
import { revisionItinerary } from "@/features/revisions/test-fixtures";
import { MapWorkspace, type MapCanvasProps } from "./map-workspace";

const enabledConfiguration: MapConfiguration = {
  enabled: true,
  browserToken: "pk.browser-map-only",
  styleUrl: "mapbox://styles/mapbox/standard",
  unavailableReason: null,
  adapter: "mapbox",
};

const projection = buildItineraryMapProjection({
  roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
  planVersionId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
  planVersion: 1,
  itinerary: revisionItinerary(),
  evidence: [],
  destinationResolution: {
    schemaVersion: "1",
    originalQuery: "Yosemite",
    normalizedQuery: "yosemite",
    status: "resolved",
    canonicalPlaceId: "nps:yose",
    canonicalName: "Yosemite National Park",
    providerPlaceId: null,
    npsParkCode: "yose",
    coordinates: { latitude: 37.8651, longitude: -119.5383 },
    boundingBox: [-119.886, 37.494, -119.196, 38.186],
    locality: null,
    region: "California",
    country: "United States",
    candidateCount: 1,
    selectedCandidateIndex: 0,
    resolutionMethod: "exact_official_match",
    corroborationSources: ["nps"],
    corroborationScore: 1,
    confidence: "high",
    ambiguityReasons: [],
    evidenceIds: [],
    semanticHash:
      "a23e211616c12a1289fd9c289440c26793955b5f43654b48d292cf7ae986322b",
  },
  privacyMode: "member",
  publishedAt: "2026-07-18T13:00:00.000Z",
  historical: true,
  generatedAt: "2026-07-18T14:00:00.000Z",
});

function DeterministicMap({ markers, onSelectMarker }: MapCanvasProps) {
  return (
    <div aria-label="Interactive itinerary map">
      {markers.map((marker) => (
        <button
          type="button"
          key={marker.markerId}
          onClick={() => onSelectMarker(marker.markerId)}
        >
          Map marker {marker.label}
        </button>
      ))}
    </div>
  );
}

const common: ComponentProps<typeof MapWorkspace> = {
  itinerary: revisionItinerary(),
  projection,
  configuration: enabledConfiguration,
  mapCanvas: DeterministicMap,
};

describe("MapWorkspace", () => {
  afterEach(() => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  it("renders the exact-version desktop split and synchronized selection", () => {
    render(<MapWorkspace {...common} />);
    expect(
      screen.getByText(
        "Viewing Version 1 — evidence as checked when this version was published.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "Itinerary map" })).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Spatial itinerary" }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Map marker Glacier Point sunset",
      }),
    );
    expect(
      screen.getByRole("article", {
        name: "Selected place: Glacier Point sunset",
      }),
    ).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Glacier Point sunset selected",
    );
  });

  it("filters markers and route summaries by day", () => {
    render(<MapWorkspace {...common} />);
    fireEvent.click(screen.getByRole("button", { name: /Day 2/ }));
    expect(
      screen.getByRole("button", { name: "Map marker Yosemite Falls" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "Map marker Glacier Point sunset",
      }),
    ).not.toBeInTheDocument();
  });

  it("offers mobile Map/Plan modes and three sheet positions", () => {
    render(<MapWorkspace {...common} />);
    fireEvent.click(screen.getByRole("button", { name: "Map mode" }));
    expect(
      screen.getByRole("button", { name: "Expand place sheet" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Expand place sheet" }));
    expect(screen.getByTestId("place-sheet")).toHaveAttribute(
      "data-position",
      "half",
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand place sheet" }));
    expect(screen.getByTestId("place-sheet")).toHaveAttribute(
      "data-position",
      "expanded",
    );
    fireEvent.click(screen.getByRole("button", { name: "Plan mode" }));
    expect(screen.getByTestId("map-workspace")).toHaveAttribute(
      "data-mobile-mode",
      "plan",
    );
  });

  it("keeps the itinerary usable when maps are disabled", () => {
    render(
      <MapWorkspace
        {...common}
        configuration={{
          ...enabledConfiguration,
          enabled: false,
          browserToken: null,
          unavailableReason: "maps_disabled",
        }}
      />,
    );
    expect(
      screen.getByText(
        "Map view is unavailable. Your itinerary and route details are still available.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Glacier Point sunset")).toBeVisible();
    expect(
      screen.queryByLabelText("Interactive itinerary map"),
    ).not.toBeInTheDocument();
  });

  it("announces offline fallback and lets Escape collapse the mobile sheet", () => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
    render(<MapWorkspace {...common} />);
    fireEvent.click(screen.getByRole("button", { name: "Map mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand place sheet" }));
    expect(screen.getByTestId("place-sheet")).toHaveAttribute(
      "data-position",
      "half",
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("place-sheet")).toHaveAttribute(
      "data-position",
      "collapsed",
    );

    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });
    fireEvent(window, new Event("offline"));
    expect(
      screen.getByText(
        "Map view is unavailable while offline. Your itinerary and route details are still available.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Glacier Point sunset")).toBeVisible();
  });
});
