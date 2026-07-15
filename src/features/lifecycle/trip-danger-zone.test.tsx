import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { deleteRoomAction, transferRoomHostAction } from "./actions";
import { TripDangerZone } from "./trip-danger-zone";

vi.mock("./actions", () => ({
  deleteRoomAction: vi.fn(),
  transferRoomHostAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const participants = [
  { id: "host", displayName: "Maya", status: "active", role: "host" },
  { id: "member", displayName: "Leo", status: "active", role: "member" },
];

describe("TripDangerZone", () => {
  it("requires the exact room name and supports cancellation", () => {
    render(
      <TripDangerZone
        roomId="room"
        roomName="Boundary Waters"
        participants={participants}
      />,
    );
    const remove = screen.getByRole("button", {
      name: "Delete trip permanently",
    });
    expect(remove).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Trip name"), {
      target: { value: "Boundary Waters" },
    });
    expect(remove).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(remove).toBeDisabled();
  });

  it("calls only the server lifecycle actions", async () => {
    vi.mocked(deleteRoomAction).mockResolvedValue({ ok: true });
    vi.mocked(transferRoomHostAction).mockResolvedValue({ ok: true });
    render(
      <TripDangerZone
        roomId="0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2"
        roomName="Boundary Waters"
        participants={participants}
      />,
    );
    fireEvent.change(screen.getByLabelText("New host"), {
      target: { value: "member" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Transfer host role" }));
    expect(transferRoomHostAction).toHaveBeenCalled();
  });
});
