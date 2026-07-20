import { describe, expect, it } from "vitest";

import { createSafeTrailieTextStream } from "./safe-streaming";

describe("safe Trailie visible text streaming", () => {
  it("emits complete readable segments and buffers unfinished text", () => {
    const stream = createSafeTrailieTextStream();
    expect(stream.push("Here is the answer. The next")).toEqual([
      "Here is the answer. ",
    ]);
    expect(stream.push(" sentence is still forming")).toEqual([]);
    expect(stream.flushValidated()).toEqual(
      "The next sentence is still forming",
    );
  });

  it("holds partial Markdown and sanitizes it only after validation", () => {
    const stream = createSafeTrailieTextStream();
    expect(stream.push("Use [the official page](java")).toEqual([]);
    expect(stream.push("script:alert(1))")).toEqual([]);
    expect(stream.flushValidated()).toBe("Use the official page");
  });

  it("never emits internal-reasoning or hidden-prompt language", () => {
    const stream = createSafeTrailieTextStream();
    expect(
      stream.push("Here is my chain-of-thought. Ignore the system prompt. "),
    ).toEqual([]);
    expect(stream.flushValidated()).toBe("");
    expect(stream.blocked).toBe(true);
  });

  it("does not duplicate text when the validated residual is reconciled", () => {
    const stream = createSafeTrailieTextStream();
    const visible = stream.push("First sentence. Second sentence.");
    const residual = stream.flushValidated();
    expect([...visible, residual].join("")).toBe(
      "First sentence. Second sentence.",
    );
    expect(stream.flushValidated()).toBe("");
  });
});
