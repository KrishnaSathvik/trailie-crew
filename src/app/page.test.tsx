import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Trailie Crew landing page", () => {
  it("presents the complete product story and trip entry actions", () => {
    render(<Home />);

    expect(screen.getAllByText("Trailie Crew")).not.toHaveLength(0);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Plan the trip. Keep everyone together.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Plan trips together. Ask Trailie when you need help."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Create a Trip" })[0],
    ).toHaveAttribute("href", "/trips/create");
    expect(
      screen.getAllByRole("link", { name: "Join a Trip" })[0],
    ).toHaveAttribute("href", "/join");
    expect(
      screen.getByRole("heading", { name: "How your crew gets there" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Built for the whole crew" }),
    ).toBeInTheDocument();
    expect(screen.getByText("A clear plan, with sources")).toBeInTheDocument();
  });

  it("does not expose internal or event language", () => {
    render(<Home />);
    expect(document.body).not.toHaveTextContent(
      /build week|hackathon|experiment|prototype|acceptance|model|pipeline/i,
    );
  });
});
