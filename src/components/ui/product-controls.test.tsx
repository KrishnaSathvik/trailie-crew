import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  EmptyState,
  buttonClassName,
  inputClassName,
} from "./product-controls";

describe("product controls", () => {
  it("provides one consistent button and input system", () => {
    expect(buttonClassName({ variant: "primary" })).toContain("min-h-11");
    expect(buttonClassName({ variant: "secondary" })).toContain("border");
    expect(buttonClassName({ variant: "ghost" })).toContain("hover:");
    expect(buttonClassName({ variant: "destructive" })).toContain(
      "bg-destructive",
    );
    expect(buttonClassName({ variant: "text" })).toContain("underline");
    expect(inputClassName).toContain("min-h-11");
  });

  it("renders a directed empty state with one primary action", () => {
    render(
      <EmptyState
        title="No comments yet"
        description="Comments on this part of the plan will appear here."
        action={<button type="button">Add a comment</button>}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "No comments yet" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Add a comment" })).toBeVisible();
  });
});
