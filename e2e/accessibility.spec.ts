import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoSeriousAxeViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const violations = results.violations.filter(({ impact }) =>
    ["critical", "serious"].includes(impact ?? ""),
  );
  expect(
    violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.flatMap(({ target }) => target),
    })),
    `${label} has critical or serious accessibility violations`,
  ).toEqual([]);
}

test("landing, entry, and authenticated chat have no serious axe findings", async ({
  page,
}) => {
  await page.goto("/");
  await expectNoSeriousAxeViolations(page, "landing");

  await page.goto("/trips/create");
  await expectNoSeriousAxeViolations(page, "create Trip");

  await page.goto("/join");
  await expectNoSeriousAxeViolations(page, "join Trip");

  for (const path of [
    "/privacy",
    "/terms",
    "/accuracy",
    "/support",
    "/settings",
  ]) {
    await page.goto(path);
    await expectNoSeriousAxeViolations(page, path);
  }

  await page.goto("/trips/create");
  await page.getByLabel("Trip name").fill("Accessible Preview Trip");
  await page.getByLabel("Your display name").fill("Maya");
  await page.getByRole("button", { name: "Create Trip" }).click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
  await expect(page).toHaveTitle("Trailie Crew");
  await expectNoSeriousAxeViolations(page, "authenticated chat");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.getByRole("button", { name: "People" }).click();
  await expect(
    page.getByRole("dialog", { name: "Crew presence" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "People" })).toBeFocused();
  await expectNoSeriousAxeViolations(page, "mobile reduced-motion dark chat");

  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await expect(page.locator("body")).toBeVisible();
  await expectNoSeriousAxeViolations(page, "200 percent zoom");

  await page.evaluate(() => {
    document.documentElement.style.zoom = "1";
  });
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expectNoSeriousAxeViolations(page, "400 percent equivalent reflow");
});
