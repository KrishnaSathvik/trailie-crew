import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AccuracyPage from "./accuracy/page";
import PrivacyPage from "./privacy/page";
import SupportPage from "./support/page";
import TermsPage from "./terms/page";

describe("public trust pages", () => {
  it.each([
    ["Privacy notice", PrivacyPage],
    ["Terms of Preview use", TermsPage],
    ["Accuracy and availability", AccuracyPage],
    ["Support and abuse reports", SupportPage],
  ])("renders %s and marks it for professional review", (title, Page) => {
    render(<Page />);
    expect(screen.getByRole("heading", { name: title })).toBeVisible();
    expect(screen.getByText(/professional review required/i)).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: /trust, legal/i }),
    ).toBeVisible();
  });
});
