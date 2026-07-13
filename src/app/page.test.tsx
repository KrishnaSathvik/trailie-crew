import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Trailie Crew landing page", () => {
  it("presents the core brand and trip entry actions", () => {
    render(<Home />);

    expect(screen.getByText("Trailie Crew")).toBeInTheDocument();
    expect(screen.getByText("A TrailVerse experiment")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Plan trips together, naturally.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create a Trip" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Join a Trip" }),
    ).toBeInTheDocument();
  });
});
