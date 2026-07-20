import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { assessAccountDeletionAction, deleteAccountAction } from "./actions";
import { AccountDangerZone } from "./account-danger-zone";

vi.mock("./actions", () => ({
  assessAccountDeletionAction: vi.fn(),
  deleteAccountAction: vi.fn(),
}));

describe("AccountDangerZone", () => {
  it("blocks a current host and lists affected rooms", async () => {
    vi.mocked(assessAccountDeletionAction).mockResolvedValue({
      ok: true,
      data: {
        soleHostRooms: [{ id: "room", name: "Boundary Waters" }],
        hostRooms: [{ id: "room", name: "Boundary Waters" }],
        ordinaryMemberships: 0,
      },
    });
    render(<AccountDangerZone />);
    expect(await screen.findByText("Boundary Waters")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Type DELETE MY ACCOUNT"), {
      target: { value: "DELETE MY ACCOUNT" },
    });
    expect(
      screen.getByRole("button", { name: "Delete my account" }),
    ).toBeDisabled();
  });

  it("requires the exact destructive phrase", async () => {
    vi.mocked(assessAccountDeletionAction).mockResolvedValue({
      ok: true,
      data: { soleHostRooms: [], hostRooms: [], ordinaryMemberships: 1 },
    });
    vi.mocked(deleteAccountAction).mockResolvedValue({
      ok: false,
      error: "lifecycle_unavailable",
    });
    render(<AccountDangerZone />);
    await waitFor(() => expect(assessAccountDeletionAction).toHaveBeenCalled());
    const button = screen.getByRole("button", { name: "Delete my account" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Type DELETE MY ACCOUNT"), {
      target: { value: "DELETE MY ACCOUNT" },
    });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(
      await screen.findByText(/couldn’t delete your account/i),
    ).toBeVisible();
  });
});
