import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { SafeMarkdownView } from "./safe-markdown-view";

it("renders safe Markdown semantics without raw HTML or unsafe URLs", () => {
  render(
    <SafeMarkdownView
      markdown={`## Keep in mind

- **Snow** is possible
- Read the [official update](https://www.nps.gov/)

> Conditions may change.

<script>unsafe()</script> [bad](javascript:alert(1))`}
    />,
  );

  expect(screen.getByRole("heading", { name: "Keep in mind" })).toBeVisible();
  expect(screen.getByRole("strong")).toHaveTextContent("Snow");
  expect(screen.getByRole("link", { name: "official update" })).toHaveAttribute(
    "href",
    "https://www.nps.gov/",
  );
  expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
  expect(screen.queryByText(/<script>/)).toBeNull();
});
