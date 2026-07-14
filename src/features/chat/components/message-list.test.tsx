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
