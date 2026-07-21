import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TripEntryLayout } from "./trip-entry-layout";

describe("TripEntryLayout", () => {
  it("gives entry pages the shared trust navigation", () => {
    render(
      <TripEntryLayout
        eyebrow="Join a Trip"
        title="Find your crew."
        description="Use the invitation link your host shared."
        footnote="Next: pick the name your crew will see."
      >
        <form aria-label="Join" />
      </TripEntryLayout>,
    );

    expect(
      screen.getByRole("navigation", { name: /trust, legal/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 1, name: "Find your crew." }),
    ).toBeVisible();
    expect(screen.getByRole("form", { name: "Join" })).toBeVisible();
  });
});
