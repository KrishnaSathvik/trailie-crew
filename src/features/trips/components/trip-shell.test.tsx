import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TripShell } from "./trip-shell";
import { TransientInviteProvider } from "./transient-invite-provider";
vi.mock("@/features/planning/actions", () => ({
  getPlanningRequestAction: vi.fn().mockResolvedValue({ ok: true, data: null }),
  createPlanningRequestAction: vi.fn(),
  reviewPlanningSummaryAction: vi.fn(),
  regeneratePlanningSummaryAction: vi.fn(),
}));
vi.mock("@/features/itinerary/actions", () => ({
  getTripPlanAction: vi.fn().mockResolvedValue({ ok: true, data: null }),
  generateItineraryAction: vi.fn(),
}));

function renderShell(element: React.ReactNode) {
  return render(<TransientInviteProvider>{element}</TransientInviteProvider>);
}

const shell = {
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
    id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
    roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
    userId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
    displayName: "Maya",
    role: "host" as const,
    status: "active" as const,
    joinedAt: "2026-07-13T18:00:00.000Z",
    lastSeenAt: null,
  },
  participants: [
    {
      id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
      roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
      userId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
      displayName: "Maya",
      role: "host" as const,
      status: "active" as const,
      joinedAt: "2026-07-13T18:00:00.000Z",
      lastSeenAt: null,
    },
    {
      id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
      roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
      userId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
      displayName: "Leo",
      role: "member" as const,
      status: "active" as const,
      joinedAt: "2026-07-13T18:01:00.000Z",
      lastSeenAt: null,
    },
  ],
  inviteMetadata: { shortCode: "ABCD2345" },
  initialMessages: { messages: [], hasMore: false, nextCursor: null },
  initialHistoryError: false,
};

describe("TripShell", () => {
  it("renders the room, identity, crew, and shared conversation", () => {
    renderShell(<TripShell data={shell} />);
    expect(
      screen.getByRole("heading", { name: "Boundary Waters" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Maya (you)")).toBeInTheDocument();
    expect(screen.getByText("Leo")).toBeInTheDocument();
    expect(screen.getByText("Start the conversation")).toBeInTheDocument();
    expect(screen.queryByText(/chat with trailie/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("Plan").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Map").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("navigation", { name: "Trip sections" }),
    ).toHaveLength(2);
  });

  it("shows host invitation controls", () => {
    renderShell(<TripShell data={shell} />);
    expect(screen.getByText("Invite Your Crew")).toBeInTheDocument();
    expect(screen.getAllByText("ABCD2345").length).toBeGreaterThan(0);
  });

  it("opens Plan from navigation and returns to Chat", async () => {
    renderShell(<TripShell data={shell} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Plan" })[0]);
    expect(
      await screen.findByRole("button", { name: "Build Our Itinerary" }),
    ).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "Chat" })[0]);
    expect(screen.getByText("Start the conversation")).toBeVisible();
  });

  it("opens the map entry point without replacing the planning workflow", async () => {
    renderShell(<TripShell data={shell} />);
    const mapButton = screen.getAllByRole("button", { name: "Map" })[0];
    expect(mapButton).toBeEnabled();
    fireEvent.click(mapButton);
    expect(
      await screen.findByRole("button", { name: "Build Our Itinerary" }),
    ).toBeVisible();
    expect(screen.getByText("Spatial itinerary")).toBeVisible();
  });

  it("limits members to safe room-code information", () => {
    renderShell(
      <TripShell
        data={{
          ...shell,
          currentParticipant: { ...shell.currentParticipant, role: "member" },
          inviteMetadata: null,
        }}
      />,
    );
    expect(screen.queryByText("Invite Your Crew")).not.toBeInTheDocument();
    expect(screen.getByText("Room code")).toBeInTheDocument();
  });
});
