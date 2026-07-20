import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AccuracyPage from "./accuracy/page";
import PrivacyPage from "./privacy/page";
import SupportPage from "./support/page";
import TermsPage from "./terms/page";

describe("public trust pages", () => {
  it.each([
    ["Privacy notice", PrivacyPage],
    ["Terms of use", TermsPage],
    ["Accuracy and availability", AccuracyPage],
    ["Support", SupportPage],
  ])("renders %s as customer-facing product copy", (title, Page) => {
    render(<Page />);
    expect(screen.getByRole("heading", { name: title })).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: /trust, legal/i }),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent(
      /preview|production|draft|professional review|github issue|room|model|provider|error code|workflow|token counts/i,
    );
  });
});
