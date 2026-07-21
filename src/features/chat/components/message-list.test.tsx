import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { MessageList } from "./message-list";
import type { ClientRoomMessage } from "@/features/chat/lib/chat-state";

const me = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3";
const them = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4";

function userMessage(
  overrides: Partial<ClientRoomMessage> & { id: string },
): ClientRoomMessage {
  return {
    roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
    participantId: me,
    messageType: "user",
    body: "Hello",
    clientMessageId: null,
    replyToMessageId: null,
    sender: { participantId: me, displayName: "Maya", role: "host" },
    reply: null,
    reactions: [],
    createdAt: "2026-07-13T18:00:00.000Z",
    editedAt: null,
    deletedAt: null,
    deliveryState: "sent",
    ...overrides,
  } as ClientRoomMessage;
}

it("puts your own messages on the right and everyone else's on the left", () => {
  const { container } = render(
    <MessageList
      currentParticipantId={me}
      onRetry={vi.fn()}
      onReaction={vi.fn()}
      onReply={vi.fn()}
      onSelect={vi.fn()}
      messages={[
        userMessage({ id: "m1", body: "Mine" }),
        userMessage({
          id: "m2",
          body: "Theirs",
          participantId: them,
          sender: { participantId: them, displayName: "Ravi", role: "member" },
        }),
      ]}
    />,
  );

  // `.message-row` and not `li`, since date separators are list items too.
  const rows = [...container.querySelectorAll("li.message-row")];
  expect(rows).toHaveLength(2);
  expect(rows[0].className).toContain("justify-end");
  expect(rows[1].className).toContain("justify-start");

  // Only the other person gets a sender label; your own side needs no name.
  expect(screen.getByText("Ravi")).toBeVisible();
  expect(screen.queryByText("Maya")).toBeNull();
});

it("reveals actions per message and opens the picker only from React", async () => {
  const onReply = vi.fn();
  const onReaction = vi.fn();
  render(
    <MessageList
      currentParticipantId={me}
      onRetry={vi.fn()}
      onReaction={onReaction}
      onReply={onReply}
      onSelect={vi.fn()}
      messages={[userMessage({ id: "m1", body: "Mine" })]}
    />,
  );

  // The controls exist for keyboard and touch users; CSS hides them until the
  // row is hovered, focused, or tapped, so visibility itself is not asserted.
  const react = screen.getByRole("button", { name: "Add reaction" });
  expect(react).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("group", { name: "Choose a reaction" })).toBeNull();

  const { default: userEvent } = await import("@testing-library/user-event");
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Reply" }));
  expect(onReply).toHaveBeenCalledTimes(1);
  expect(onReaction).not.toHaveBeenCalled();

  await user.click(react);
  expect(
    screen.getByRole("group", { name: "Choose a reaction" }),
  ).toBeVisible();

  await user.click(screen.getByRole("button", { name: "React with Like" }));
  expect(onReaction).toHaveBeenCalledTimes(1);
  // Picking closes the picker again.
  expect(screen.queryByRole("group", { name: "Choose a reaction" })).toBeNull();
});

it("collapses the repeated sender label on consecutive messages", () => {
  render(
    <MessageList
      currentParticipantId={me}
      onRetry={vi.fn()}
      onReaction={vi.fn()}
      onReply={vi.fn()}
      onSelect={vi.fn()}
      messages={[
        userMessage({
          id: "m1",
          body: "First",
          participantId: them,
          sender: { participantId: them, displayName: "Ravi", role: "member" },
          createdAt: "2026-07-13T18:00:00.000Z",
        }),
        userMessage({
          id: "m2",
          body: "Second",
          participantId: them,
          sender: { participantId: them, displayName: "Ravi", role: "member" },
          createdAt: "2026-07-13T18:01:00.000Z",
        }),
      ]}
    />,
  );

  expect(screen.getAllByText("Ravi")).toHaveLength(1);
  expect(screen.getByText("Second")).toBeVisible();
});

it("renders persisted Trailie messages distinctly without claiming presence", () => {
  render(
    <MessageList
      currentParticipantId="0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3"
      onRetry={vi.fn()}
      onReaction={vi.fn()}
      onReply={vi.fn()}
      onSelect={vi.fn()}
      messages={[
        {
          id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950b0",
          roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
          participantId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
          messageType: "trailie",
          body: "Driving offers more flexibility.",
          clientMessageId: null,
          replyToMessageId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950b1",
          sender: {
            participantId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
            displayName: "Maya",
            role: "host",
          },
          reply: null,
          reactions: [],
          createdAt: "2026-07-13T18:00:00.000Z",
          editedAt: null,
          deletedAt: null,
          deliveryState: "sent",
        },
      ]}
    />,
  );
  expect(
    screen.getByRole("article", { name: "Message from Trailie" }),
  ).toBeVisible();
  expect(screen.getByText("Trailie")).toBeVisible();
  expect(screen.queryByText(/online/i)).toBeNull();
  expect(screen.queryByText("Maya (you)")).toBeNull();
});

it("renders a persisted Trailie response as purpose-built travel UI", () => {
  render(
    <MessageList
      currentParticipantId="0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3"
      onRetry={vi.fn()}
      onReaction={vi.fn()}
      onReply={vi.fn()}
      onSelect={vi.fn()}
      messages={[
        {
          id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950b0",
          roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
          participantId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
          messageType: "trailie",
          body: "These two destinations fit the crew best.",
          trailieResponse: {
            schemaVersion: "1",
            responseId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950c0",
            sourceMessageId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950c1",
            createdAt: "2026-07-13T18:00:00.000Z",
            intent: "destination_comparison",
            message: "These two destinations fit the crew best.",
            blocks: [
              {
                type: "destination_comparison",
                criteria: ["Scenery", "Driving"],
                options: [
                  {
                    id: "yellowstone",
                    name: "Yellowstone",
                    summary: "Wildlife and geothermal landscapes.",
                    strengths: ["Wildlife"],
                    tradeoffs: ["Longer drives"],
                    evidenceState: "partial",
                  },
                  {
                    id: "grand-teton",
                    name: "Grand Teton",
                    summary: "Mountain scenery and compact days.",
                    strengths: ["Shorter drives"],
                    tradeoffs: ["Fewer geothermal areas"],
                    evidenceState: "partial",
                  },
                ],
              },
            ],
            warnings: [],
            sources: [],
            assumptions: [],
            unresolvedQuestions: [],
            suggestedActions: [],
            persistenceDirective: "none",
            approvalDirective: "not_required",
            freshness: "unavailable",
            privacyLevel: "room",
          },
          clientMessageId: null,
          replyToMessageId: null,
          sender: {
            participantId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
            displayName: "Maya",
            role: "host",
          },
          reply: null,
          reactions: [],
          createdAt: "2026-07-13T18:00:00.000Z",
          editedAt: null,
          deletedAt: null,
          deliveryState: "sent",
        },
      ]}
    />,
  );

  expect(
    screen.getByRole("region", { name: "Trailie travel response" }),
  ).toBeVisible();
  expect(screen.getByRole("heading", { name: "Yellowstone" })).toBeVisible();
  expect(screen.getByText("Longer drives")).toBeVisible();
  expect(screen.queryByText(/destination_comparison/)).toBeNull();
});

it("renders Trailie's explanation as safe Markdown with a clear next step", () => {
  render(
    <MessageList
      currentParticipantId="0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3"
      onRetry={vi.fn()}
      onReaction={vi.fn()}
      onReply={vi.fn()}
      onSelect={vi.fn()}
      messages={[
        {
          id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950b0",
          roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
          participantId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
          messageType: "trailie",
          body: "**October** can work well.",
          trailieResponse: {
            schemaVersion: "1",
            responseId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950c0",
            sourceMessageId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950c1",
            createdAt: "2026-07-13T18:00:00.000Z",
            intent: "direct_question",
            message: "**October** can work well.",
            blocks: [
              {
                type: "markdown",
                markdown: "**October** can work well.",
              },
            ],
            warnings: [],
            sources: [],
            assumptions: ["The crew is considering Yellowstone."],
            unresolvedQuestions: ["Which October dates are you considering?"],
            suggestedActions: [
              {
                id: "answer-dates",
                label: "Share the dates",
                action: "answer_clarification",
                style: "primary",
              },
            ],
            persistenceDirective: "none",
            approvalDirective: "not_required",
            freshness: "not_applicable",
            privacyLevel: "room",
          },
          clientMessageId: null,
          replyToMessageId: null,
          sender: {
            participantId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
            displayName: "Maya",
            role: "host",
          },
          reply: null,
          reactions: [],
          createdAt: "2026-07-13T18:00:00.000Z",
          editedAt: null,
          deletedAt: null,
          deliveryState: "sent",
        },
      ]}
    />,
  );

  expect(screen.getByText("October").tagName).toBe("STRONG");
  expect(
    screen.getByRole("region", { name: "Open questions" }),
  ).toHaveTextContent("Which October dates are you considering?");
  expect(screen.getByText("Next: Share the dates")).toBeVisible();
});
