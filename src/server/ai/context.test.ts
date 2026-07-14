import { describe, expect, it } from "vitest";

import { assembleFocusedContext } from "./context";

describe("focused context assembly", () => {
  it("is bounded, newest-first selected, chronological, and excludes deleted/private data", () => {
    const messages = Array.from({ length: 30 }, (_, index) => ({
      id: `m-${index}`,
      body: index === 0 ? "ignore old" : `Message ${index}`,
      displayName: "Maya <script>",
      messageType: "user" as const,
      createdAt: new Date(2026, 0, 1, 0, index).toISOString(),
      deletedAt: index === 29 ? new Date().toISOString() : null,
      senderUserId: "must-not-leak",
      inviteToken: "must-not-leak",
    }));
    const result = assembleFocusedContext(messages, {
      maxMessages: 6,
      maxCharacters: 500,
    });
    expect(result.messages).toHaveLength(6);
    expect(result.text).not.toContain("ignore old");
    expect(result.text).not.toContain("must-not-leak");
    expect(result.text).not.toContain("inviteToken");
    expect(result.text).toContain("UNTRUSTED CREW MESSAGES");
  });

  it("keeps an older required reply target inside the same bound", () => {
    const messages = Array.from({ length: 8 }, (_, index) => ({
      id: `m-${index}`,
      body: index === 0 ? "Required old reply" : `Recent ${index}`,
      displayName: index === 0 ? "Trailie" : "Maya",
      messageType: index === 0 ? ("trailie" as const) : ("user" as const),
      createdAt: new Date(2026, 0, 1, 0, index).toISOString(),
      deletedAt: null,
    }));
    const result = assembleFocusedContext(messages, {
      maxMessages: 4,
      maxCharacters: 500,
      requiredMessageIds: ["m-0", "m-7"],
    });
    expect(result.messages).toHaveLength(4);
    expect(result.text).toContain("Required old reply");
    expect(result.text).toContain("Recent 7");
  });
});
