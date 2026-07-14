import { describe, expect, it } from "vitest";

import { detectTrailieInvocation } from "./detect-invocation";

describe("deterministic Trailie invocation", () => {
  it.each([
    [
      "@Trailie what is the best month for Yosemite?",
      "what is the best month for Yosemite?",
    ],
    ["Hey Trailie, compare driving and flying.", "compare driving and flying."],
    ["trailie: can you explain that?", "can you explain that?"],
    ["TRAILIE, help us pick.", "help us pick."],
  ])("invokes for directed requests: %s", (body, normalizedRequest) => {
    expect(detectTrailieInvocation({ body })).toMatchObject({
      invoked: true,
      normalizedRequest,
    });
  });

  it.each([
    "I like the Trailie design",
    "Trailie Crew is working",
    "Should we ask Trailie later?",
    "We can ask @Trailie later",
    "The @Trailie feature looks good",
    "`@Trailie do something`",
    "> @Trailie suggested this yesterday",
    "hello@trailie.com",
    "@TrailieCrew help",
    "```ts\n@Trailie doSomething()\n```",
    "\\@Trailie help",
  ])("stays silent for non-invoking text: %s", (body) => {
    expect(detectTrailieInvocation({ body })).toEqual({ invoked: false });
  });

  it("creates one decision for multiple mentions and keeps the original untouched", () => {
    const body = "@Trailie compare these, then tell @Trailie the winner";
    const decision = detectTrailieInvocation({ body });
    expect(decision).toMatchObject({
      invoked: true,
      invocationType: "explicit_mention",
      normalizedRequest: "compare these, then tell the winner",
    });
    expect(body).toBe("@Trailie compare these, then tell @Trailie the winner");
  });

  it("invokes a normal user message replying to a persisted Trailie message", () => {
    expect(
      detectTrailieInvocation({
        body: "What about trains?",
        replyTargetType: "trailie",
      }),
    ).toMatchObject({
      invoked: true,
      invocationType: "reply_to_trailie",
      normalizedRequest: "What about trains?",
    });
  });

  it("supports only the Phase 2A application action", () => {
    expect(
      detectTrailieInvocation({
        body: "Compare them",
        applicationAction: "answer_question",
      }),
    ).toMatchObject({ invoked: true, invocationType: "application_action" });
  });

  it("turns an empty direct mention into a concise clarification request", () => {
    expect(detectTrailieInvocation({ body: "@Trailie" })).toMatchObject({
      invoked: true,
      normalizedRequest: "Ask what help the crew needs.",
    });
  });
});
