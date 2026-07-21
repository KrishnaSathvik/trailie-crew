import { describe, expect, it } from "vitest";
import { itinerarySchema } from "@trailie/schemas";
import {
  buildItineraryRequest,
  runWithOneStructuralRepair,
} from "./openai-provider";
import { createFakeItineraryProvider } from "./provider";

describe("itinerary provider boundary", () => {
  it("classifies platform timeout errors as model timeouts", async () => {
    const providerModule = (await import("./openai-provider")) as Record<
      string,
      unknown
    >;
    const mapError = providerModule.mapItineraryProviderError;

    expect(mapError).toBeTypeOf("function");
    expect(
      (mapError as (error: unknown, repair: boolean) => { code: string })(
        new DOMException("Timed out", "TimeoutError"),
        false,
      ).code,
    ).toBe("model_timeout");
    expect(
      (mapError as (error: unknown, repair: boolean) => { code: string })(
        new (await import("openai")).default.APIUserAbortError(),
        false,
      ).code,
    ).toBe("model_timeout");
  });

  it("builds a bounded low-latency strict Responses API request", () => {
    const request = buildItineraryRequest({
      model: "gpt-5.6-sol",
      safetyIdentifier: "safe-id",
      context: "approved context",
    });
    expect(request).toMatchObject({
      model: "gpt-5.6-sol",
      reasoning: { effort: "low" },
      store: false,
      max_output_tokens: 8_000,
      safety_identifier: "safe-id",
    });
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("stream");
    expect(request.text.format).toMatchObject({
      type: "json_schema",
      strict: true,
      name: "trailie_itinerary",
    });
  });

  it("produces a deterministic conflict and repairs it exactly once", async () => {
    const provider = createFakeItineraryProvider();
    const generated = await provider.generate({
      operationKey: "plan:1",
      model: "gpt-5.6-sol",
      safetyIdentifier: "safe",
      context: "Yosemite September 12",
      signal: AbortSignal.timeout(1000),
    });
    expect(itinerarySchema.safeParse(generated.itinerary).success).toBe(true);
    expect(generated.itinerary.days[0].items[1].startTime).toBe("16:00");
    const repaired = await provider.repair({
      operationKey: "plan:1:repair",
      model: "gpt-5.6-sol",
      safetyIdentifier: "safe",
      context: JSON.stringify({
        draft: generated.itinerary,
        issues: ["route_timing_impossible"],
      }),
      signal: AbortSignal.timeout(1000),
    });
    expect(repaired.itinerary.days[0].items[1].startTime).toBe("17:30");
    expect(repaired.itinerary.title).toBe(generated.itinerary.title);
  });

  it("supports invalid, unrepairable, and provider-failure fixtures", async () => {
    await expect(
      createFakeItineraryProvider({ scenario: "provider_failure" }).generate({
        operationKey: "failure",
        model: "gpt-5.6-sol",
        safetyIdentifier: "safe",
        context: "fixture",
        signal: AbortSignal.timeout(1000),
      }),
    ).rejects.toMatchObject({ code: "model_unavailable" });
    const unrepairable = await createFakeItineraryProvider({
      scenario: "unrepairable",
    }).generate({
      operationKey: "blocked",
      model: "gpt-5.6-sol",
      safetyIdentifier: "safe",
      context: "fixture",
      signal: AbortSignal.timeout(1000),
    });
    expect(JSON.stringify(unrepairable.itinerary)).toContain(
      "Las Vegas casino",
    );
  });

  it("allows at most one structural response repair", async () => {
    let attempts = 0;
    const result = await runWithOneStructuralRepair(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("invalid_itinerary_response");
      return "valid";
    });
    expect(result).toBe("valid");
    expect(attempts).toBe(2);
    await expect(
      runWithOneStructuralRepair(async () => {
        throw new Error("invalid_itinerary_response");
      }),
    ).rejects.toThrow("invalid_itinerary_response");
  });
});
