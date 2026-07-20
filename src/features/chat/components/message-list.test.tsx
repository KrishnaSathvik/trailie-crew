import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { MessageList } from "./message-list";

it("renders persisted Trailie messages distinctly without claiming presence", () => {
  render(
    <MessageList
      currentParticipantId="0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3"
      onRetry={vi.fn()}
      onReaction={vi.fn()}
      onReply={vi.fn()}
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
