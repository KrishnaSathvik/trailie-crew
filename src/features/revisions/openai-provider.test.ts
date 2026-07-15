import { describe, expect, it } from "vitest";

import { mapRevisionProviderError } from "./openai-provider";

describe("revision OpenAI failure mapping", () => {
  it("maps both timeout and abort deadlines to a retryable model timeout", () => {
    expect(
      mapRevisionProviderError(
        new DOMException("timed out", "TimeoutError"),
        "analysis",
      ),
    ).toMatchObject({ code: "model_timeout", retryable: true });
    expect(
      mapRevisionProviderError(
        new DOMException("aborted", "AbortError"),
        "candidate",
      ),
    ).toMatchObject({ code: "model_timeout", retryable: true });
  });
});
