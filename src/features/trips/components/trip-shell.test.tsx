import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TripShell } from "./trip-shell";
import { TransientInviteProvider } from "./transient-invite-provider";

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
};

describe("TripShell", () => {
  it("renders the room, identity, crew, and honest placeholders", () => {
    renderShell(<TripShell data={shell} />);
    expect(
      screen.getByRole("heading", { name: "Boundary Waters" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Maya (you)")).toBeInTheDocument();
    expect(screen.getByText("Leo")).toBeInTheDocument();
    expect(screen.getByText("Chat is coming next")).toBeInTheDocument();
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
