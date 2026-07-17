import { afterEach, describe, expect, it, vi } from "vitest";

import {
  withHostedFocusedFault,
  withHostedMemoryFault,
} from "./hosted-acceptance-faults";

afterEach(() => vi.unstubAllEnvs());

describe("protected hosted acceptance provider faults", () => {
  it("is inert outside an explicitly enabled Preview", async () => {
    const stream = vi.fn().mockResolvedValue({ delegated: true });
    const provider = withHostedFocusedFault({ stream } as never);
    await expect(
      provider.stream({
        operationKey: "inert",
        request: "[[trailie-acceptance:focused-503-once]]",
      } as never),
    ).resolves.toEqual({ delegated: true });
  });

  it("fails one focused attempt and delegates the retry", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("HOSTED_ACCEPTANCE_PROVIDER_FAULT", "focused_503_once");
    const stream = vi.fn().mockResolvedValue({ delegated: true });
    const provider = withHostedFocusedFault({ stream } as never);
    const input = {
      operationKey: "focused-once",
      request: "[[trailie-acceptance:focused-503-once]]",
    } as never;
    await expect(provider.stream(input)).rejects.toMatchObject({
      statusCode: 503,
      retryable: true,
    });
    await expect(provider.stream(input)).resolves.toEqual({ delegated: true });
    expect(stream).toHaveBeenCalledOnce();
  });

  it("fails one Luna attempt and delegates the retry", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("HOSTED_ACCEPTANCE_PROVIDER_FAULT", "memory_503_once");
    const extract = vi.fn().mockResolvedValue({ delegated: true });
    const provider = withHostedMemoryFault({ extract } as never);
    const input = {
      operationKey: "memory-once",
      sourceMessage: {
        body: "[[trailie-acceptance:memory-503-once]] I prefer hiking",
      },
    } as never;
    await expect(provider.extract(input)).rejects.toMatchObject({
      statusCode: 503,
      retryable: true,
    });
    await expect(provider.extract(input)).resolves.toEqual({
      delegated: true,
    });
    expect(extract).toHaveBeenCalledOnce();
  });
});
