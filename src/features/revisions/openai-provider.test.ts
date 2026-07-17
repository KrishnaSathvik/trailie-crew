import { describe, expect, it } from "vitest";

import {
  buildItineraryRevisionRequest,
  buildRevisionPatchRequest,
  mapRevisionProviderError,
} from "./openai-provider";

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

  it("uses the versioned patch and separate scope-repair contracts", () => {
    const common = {
      model: "gpt-5.6-sol",
      safetyIdentifier: "safe",
      context: "bounded",
    };
    const patch = buildRevisionPatchRequest(common);
    expect(patch.instructions).toContain("trailie-revision-patch-v1");
    expect(patch.max_output_tokens).toBeLessThan(12_000);
    const scopeRepair = buildItineraryRevisionRequest({
      ...common,
      mode: "scope_repair",
    });
    const conflictRepair = buildItineraryRevisionRequest({
      ...common,
      mode: "conflict_repair",
    });
    expect(scopeRepair.instructions).toContain(
      "trailie-revision-scope-repair-v1",
    );
    expect(conflictRepair.instructions).toContain(
      "trailie-itinerary-revision-v2",
    );
    expect(scopeRepair.instructions).not.toBe(conflictRepair.instructions);
  });
});
