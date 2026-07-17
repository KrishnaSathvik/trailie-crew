import { describe, expect, it } from "vitest";
import {
  ITINERARY_REVISION_PROMPT,
  ITINERARY_REVISION_PROMPT_VERSION,
  REVISION_SCOPE_REPAIR_PROMPT,
  REVISION_SCOPE_REPAIR_PROMPT_VERSION,
} from "./itinerary-revision";
import {
  REVISION_PATCH_PROMPT,
  REVISION_PATCH_PROMPT_VERSION,
} from "./revision-patch";

describe("Phase 5D revision prompts", () => {
  it("locks patch planning to the application-owned manifest", () => {
    expect(REVISION_PATCH_PROMPT_VERSION).toBe("trailie-revision-patch-v1");
    expect(REVISION_PATCH_PROMPT).toMatch(/only operations permitted/i);
    expect(REVISION_PATCH_PROMPT).toMatch(/stable IDs/i);
    expect(REVISION_PATCH_PROMPT).toMatch(/blocked/i);
  });

  it("locks candidate generation to protected content and declared downstream changes", () => {
    expect(ITINERARY_REVISION_PROMPT_VERSION).toBe(
      "trailie-itinerary-revision-v2",
    );
    expect(ITINERARY_REVISION_PROMPT).toMatch(/protected item verbatim/i);
    expect(ITINERARY_REVISION_PROMPT).toMatch(/do not reorder unrelated/i);
    expect(ITINERARY_REVISION_PROMPT).toMatch(
      /do not convert a narrow request/i,
    );
  });

  it("makes scope repair restorative and bounded rather than expansive", () => {
    expect(REVISION_SCOPE_REPAIR_PROMPT_VERSION).toBe(
      "trailie-revision-scope-repair-v1",
    );
    expect(REVISION_SCOPE_REPAIR_PROMPT).toMatch(
      /remove unauthorized changes only/i,
    );
    expect(REVISION_SCOPE_REPAIR_PROMPT).toMatch(/may not broaden/i);
    expect(REVISION_SCOPE_REPAIR_PROMPT).not.toMatch(/general revision/i);
  });
});
