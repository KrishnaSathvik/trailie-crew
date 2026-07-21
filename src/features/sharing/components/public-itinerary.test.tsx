import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { revisionItinerary } from "@/features/revisions/test-fixtures";
import { projectPublicItinerary } from "../public-projection";
import { PublicItinerary, ShareUnavailable } from "./public-itinerary";

function shared() {
  const itinerary = revisionItinerary();
  itinerary.days[0]!.warnings = ["Road timing can change"];
  return projectPublicItinerary({
    itinerary,
    version: 1,
    publishedAt: "2026-07-14T00:00:00.000Z",
    validationStatus: "pass",
  });
}

describe("public shared itinerary", () => {
  it("renders a polished read-only version with every public section", () => {
    render(<PublicItinerary itinerary={shared()} />);
    expect(
      screen.getByRole("heading", { name: "Yosemite crew escape" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Shared Plan Version 1")).toBeInTheDocument();
    expect(screen.getByText("Shared from Trailie Crew")).toBeInTheDocument();
    for (const heading of [
      "Overview",
      "Day-by-day",
      "Travel",
      "Stay",
      "Food",
      "Trip checks",
    ]) {
      expect(
        screen.getByRole("heading", { name: heading }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByText("No bookings were made by Trailie"),
    ).toBeInTheDocument();
    expect(screen.getByText("Road timing can change")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Print or save as PDF" }),
    ).toBeInTheDocument();
  });

  it("contains no private controls, navigation, or source metadata", () => {
    const { container } = render(<PublicItinerary itinerary={shared()} />);
    expect(
      screen.queryByText(/crew chat|approval|request a change/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "https://trailiecrew.com/privacy",
    );
    expect(screen.getByRole("link", { name: "Accuracy" })).toHaveAttribute(
      "href",
      "https://trailiecrew.com/accuracy",
    );
    expect(container.textContent).not.toMatch(
      /Maya|Chicago|evidence:|validator/i,
    );
  });

  it("explains when a shared Plan has no booking handoffs", () => {
    render(<PublicItinerary itinerary={shared()} bookingHandoffs={[]} />);
    expect(
      screen.getByRole("heading", { name: "No booking options yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not currently include anything/i),
    ).toBeVisible();
  });

  it("shows privacy-safe exact-version source labels and freshness disclosure", () => {
    const itinerary = {
      ...shared(),
      conditionsDisclaimer:
        "Conditions may have changed since this version was published." as const,
      travelEvidence: [
        {
          evidenceId: "evidence:nps:park_alert:official-1",
          evidenceType: "park_alert" as const,
          provider: "nps",
          sourceName: "National Park Service",
          sourceUrl: "https://www.nps.gov/yose/planyourvisit/conditions.htm",
          retrievedAt: "2026-07-14T00:00:00.000Z",
          validUntil: "2026-07-14T00:10:00.000Z",
          freshnessState: "fresh" as const,
          verificationState: "verified" as const,
          availabilityState: "available" as const,
          confidence: "high" as const,
          targetItemId: null,
          headline: "Official park conditions",
        },
      ],
    };
    render(<PublicItinerary itinerary={itinerary} />);

    expect(
      screen.getByText(
        "Conditions may have changed since this version was published.",
      ),
    ).toBeVisible();
    expect(screen.getByText(/National Park Service · Verified/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Official park conditions" }),
    ).toHaveAttribute("rel", "noreferrer noopener");
    expect(document.body.textContent).not.toContain(
      "evidence:nps:park_alert:official-1",
    );
  });

  it("uses one generic unavailable state for every token failure", () => {
    render(<ShareUnavailable />);
    expect(
      screen.getByRole("heading", { name: "Shared Plan unavailable" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/expired or been revoked/i)).toBeInTheDocument();
  });
});
