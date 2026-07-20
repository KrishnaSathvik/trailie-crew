import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  sendMessageAction,
  toggleReactionAction,
} from "@/features/chat/actions/chat-actions";
import { invokeTrailieStream } from "@/features/trailie/streaming/invoke-trailie";

import { ChatExperience } from "./chat-experience";

vi.mock("@/features/chat/actions/chat-actions", () => ({
  sendMessageAction: vi.fn(),
  toggleReactionAction: vi.fn(),
  getRoomMessagesAction: vi.fn(),
}));

vi.mock("@/features/trailie/streaming/invoke-trailie", () => ({
  invokeTrailieStream: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: vi.fn(() => {
    const channel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      track: vi.fn().mockResolvedValue("ok"),
      untrack: vi.fn().mockResolvedValue("ok"),
      send: vi.fn().mockResolvedValue("ok"),
      httpSend: vi.fn().mockResolvedValue({ success: true }),
      presenceState: vi.fn(() => ({})),
    };
    return {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      },
      realtime: { setAuth: vi.fn().mockResolvedValue(undefined) },
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    };
  }),
}));

const data = {
  room: {
    id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
    name: "Boundary Waters",
    roomCode: "ABCD2345",
    expectedTravelers: 4,
    approvalMode: "all_active" as const,
    status: "active" as const,
    currentPlanVersion: null,
    createdAt: "2026-07-13T18:00:00.000Z",
    updatedAt: "2026-07-13T18:00:00.000Z",
  },
  currentParticipant: {
    id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
    roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
    userId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
    displayName: "Maya",
    role: "host" as const,
    status: "active" as const,
    joinedAt: "2026-07-13T18:00:00.000Z",
    lastSeenAt: null,
  },
  participants: [],
  inviteMetadata: null,
  initialMessages: { messages: [], hasMore: false, nextCursor: null },
  initialHistoryError: false,
};

describe("ChatExperience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invokeTrailieStream).mockImplementation(async function* () {
      return;
    });
  });

  it("renders an actionable empty conversation without a Trailie response", () => {
    render(<ChatExperience data={data} onPresenceChange={vi.fn()} />);
    expect(screen.getByText("Start the conversation")).toBeVisible();
    expect(screen.getByText(/share the first note/i)).toBeVisible();
    expect(screen.queryByText(/Trailie is thinking/i)).not.toBeInTheDocument();
  });

  it("marks a failed optimistic message and retries with the same client id", async () => {
    const user = userEvent.setup();
    vi.mocked(sendMessageAction)
      .mockResolvedValueOnce({ ok: false, error: "message_send_failed" })
      .mockImplementationOnce(async (input) => ({
        ok: true,
        data: {
          id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950b0",
          roomId: data.room.id,
          participantId: data.currentParticipant.id,
          messageType: "user",
          body: (input as { body: string }).body,
          clientMessageId: (input as { clientMessageId: string })
            .clientMessageId,
          replyToMessageId: null,
          sender: {
            participantId: data.currentParticipant.id,
            displayName: "Maya",
            role: "host",
          },
          reply: null,
          reactions: [],
          createdAt: "2026-07-13T18:01:00.000Z",
          editedAt: null,
          deletedAt: null,
        },
      }));

    render(<ChatExperience data={data} onPresenceChange={vi.fn()} />);
    await user.type(
      screen.getByLabelText("Message your crew"),
      "Signal is spotty{enter}",
    );
    expect(await screen.findByText("Not sent")).toBeVisible();
    const firstId = (
      vi.mocked(sendMessageAction).mock.calls[0]?.[0] as {
        clientMessageId: string;
      }
    ).clientMessageId;
    await user.click(screen.getByRole("button", { name: "Retry message" }));
    await waitFor(() =>
      expect(screen.queryByText("Not sent")).not.toBeInTheDocument(),
    );
    const retryId = (
      vi.mocked(sendMessageAction).mock.calls[1]?.[0] as {
        clientMessageId: string;
      }
    ).clientMessageId;
    expect(retryId).toBe(firstId);
    expect(screen.getAllByText("Signal is spotty")).toHaveLength(1);
  });

  it("stores @Trailie as ordinary text and produces no assistant message", async () => {
    const user = userEvent.setup();
    vi.mocked(sendMessageAction).mockResolvedValue({
      ok: false,
      error: "message_send_failed",
    });
    render(<ChatExperience data={data} onPresenceChange={vi.fn()} />);
    await user.type(
      screen.getByLabelText("Message your crew"),
      "@Trailie help{enter}",
    );
    expect(
      within(
        await screen.findByRole("article", { name: "Message from Maya" }),
      ).getByText("@Trailie help"),
    ).toBeVisible();
    expect(
      screen.queryByText(/thinking|assistant response/i),
    ).not.toBeInTheDocument();
  });

  it("turns a rejected network request into a retryable failed message", async () => {
    const user = userEvent.setup();
    vi.mocked(sendMessageAction).mockRejectedValue(new TypeError("offline"));
    render(<ChatExperience data={data} onPresenceChange={vi.fn()} />);
    await user.type(
      screen.getByLabelText("Message your crew"),
      "Offline draft{enter}",
    );
    expect(await screen.findByText("Not sent")).toBeVisible();
    expect(screen.getByLabelText("Message your crew")).toHaveValue(
      "Offline draft",
    );
    expect(screen.getByRole("button", { name: "Retry message" })).toBeVisible();
  });

  it("shows an immediate honest state and retains Stopped after cancellation", async () => {
    const user = userEvent.setup();
    vi.mocked(sendMessageAction).mockImplementation(async (input) => ({
      ok: true,
      data: {
        id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950b5",
        roomId: data.room.id,
        participantId: data.currentParticipant.id,
        messageType: "user",
        body: (input as { body: string }).body,
        clientMessageId: (input as { clientMessageId: string }).clientMessageId,
        replyToMessageId: null,
        sender: {
          participantId: data.currentParticipant.id,
          displayName: "Maya",
          role: "host",
        },
        reply: null,
        reactions: [],
        createdAt: "2026-07-13T18:01:00.000Z",
        editedAt: null,
        deletedAt: null,
      },
    }));
    vi.mocked(invokeTrailieStream).mockImplementation(async function* (input) {
      await new Promise<void>((_resolve, reject) => {
        input.signal.addEventListener(
          "abort",
          () => reject(new DOMException("Stopped", "AbortError")),
          { once: true },
        );
      });
    });

    render(<ChatExperience data={data} onPresenceChange={vi.fn()} />);
    await user.type(
      screen.getByLabelText("Message your crew"),
      "@Trailie help us pack{enter}",
    );
    expect(await screen.findByText("Reading the conversation")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Stop Trailie" }));
    expect(await screen.findByText("Stopped")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("rolls an optimistic reaction back when the mutation fails", async () => {
    const user = userEvent.setup();
    vi.mocked(toggleReactionAction).mockResolvedValue({
      ok: false,
      error: "reaction_failed",
    });
    const message = {
      id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950b1",
      roomId: data.room.id,
      participantId: data.currentParticipant.id,
      messageType: "user" as const,
      body: "Pick a trailhead",
      clientMessageId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950b2",
      replyToMessageId: null,
      sender: {
        participantId: data.currentParticipant.id,
        displayName: "Maya",
        role: "host" as const,
      },
      reply: null,
      reactions: [],
      createdAt: "2026-07-13T18:00:00.000Z",
      editedAt: null,
      deletedAt: null,
    };
    render(
      <ChatExperience
        data={{
          ...data,
          initialMessages: {
            messages: [message],
            hasMore: false,
            nextCursor: null,
          },
        }}
        onPresenceChange={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText("Add reaction"));
    await user.click(screen.getByRole("button", { name: "React with Like" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Like: 1/ }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "reaction could not be updated",
    );
  });
});
