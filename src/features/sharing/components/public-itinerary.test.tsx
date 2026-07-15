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
    expect(screen.getByLabelText("Pinned Version 1")).toBeInTheDocument();
    expect(screen.getByText("Shared from Trailie Crew")).toBeInTheDocument();
    for (const heading of [
      "Overview",
      "Day-by-day",
      "Travel",
      "Stay",
      "Food",
      "Validation and data status",
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
      "/privacy",
    );
    expect(screen.getByRole("link", { name: "Accuracy" })).toHaveAttribute(
      "href",
      "/accuracy",
    );
    expect(container.textContent).not.toMatch(
      /Maya|Chicago|evidence:|validator/i,
    );
  });

  it("uses one generic unavailable state for every token failure", () => {
    render(<ShareUnavailable />);
    expect(
      screen.getByRole("heading", { name: "Shared itinerary unavailable" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/invalid|revoked|expired/i),
    ).not.toBeInTheDocument();
  });
});
