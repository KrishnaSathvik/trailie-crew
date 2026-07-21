import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  environmentGroups,
  environmentVariableContract,
} from "./environment-contract";

const templateNames = [
  ...readFileSync(resolve(process.cwd(), ".env.example"), "utf8").matchAll(
    /^([A-Z][A-Z0-9_]*)=/gm,
  ),
].map((match) => match[1]);

describe("environment variable contract", () => {
  it("classifies every template variable exactly once", () => {
    const contractNames = environmentVariableContract.map(({ name }) => name);
    expect(new Set(contractNames).size).toBe(contractNames.length);
    expect(
      templateNames.filter((name) => !contractNames.includes(name)),
    ).toEqual([]);
  });

  it("covers every required environment group", () => {
    expect(
      [
        ...new Set(environmentVariableContract.map(({ group }) => group)),
      ].sort(),
    ).toEqual([...environmentGroups].sort());
  });

  it("never marks a browser variable as server-only", () => {
    for (const item of environmentVariableContract) {
      if (item.name.startsWith("NEXT_PUBLIC_"))
        expect(item.exposure, item.name).toBe("public");
    }
  });

  it("makes every Production requirement an explicit launch blocker", () => {
    for (const item of environmentVariableContract) {
      if (item.required.production)
        expect(item.launchBlockedWhenMissing, item.name).toBe(true);
    }
  });

  it("forbids test and bypass controls from being Production requirements", () => {
    for (const name of [
      "CAPTCHA_TEST_MODE",
      "NEXT_PUBLIC_CAPTCHA_TEST_MODE",
      "TRAVEL_CACHE_BYPASS",
      "VERCEL_AUTOMATION_BYPASS_SECRET",
    ]) {
      const item = environmentVariableContract.find(
        (candidate) => candidate.name === name,
      );
      expect(item?.required.production, name).toBe(false);
      expect(item?.safeDefault, name).toBe("forbidden");
    }
  });
});
