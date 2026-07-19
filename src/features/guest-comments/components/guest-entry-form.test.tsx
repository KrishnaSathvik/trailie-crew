import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { beginGuestSessionAction } from "../actions";
import { GuestEntryForm } from "./guest-entry-form";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));
vi.mock("../actions", () => ({
  beginGuestSessionAction: vi.fn(),
}));

describe("guest display-name entry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates the scoped session and removes the raw invite URL from history", async () => {
    vi.mocked(beginGuestSessionAction).mockResolvedValue({
      ok: true,
      data: { redirectTo: "/guest/plan" },
    });
    render(<GuestEntryForm inviteToken={"A".repeat(43)} planVersion={1} />);

    fireEvent.change(screen.getByLabelText("Guest display name"), {
      target: { value: "Jordan" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Version 1" }));
    await waitFor(() =>
      expect(beginGuestSessionAction).toHaveBeenCalledWith({
        inviteToken: "A".repeat(43),
        displayName: "Jordan",
      }),
    );
    expect(replace).toHaveBeenCalledWith("/guest/plan");
  });

  it("shows a clear unavailable state when session creation is denied", async () => {
    vi.mocked(beginGuestSessionAction).mockResolvedValue({
      ok: false,
      error: "guest_unavailable",
    });
    render(<GuestEntryForm inviteToken={"A".repeat(43)} planVersion={1} />);
    fireEvent.change(screen.getByLabelText("Guest display name"), {
      target: { value: "Jordan" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Version 1" }));
    expect(
      await screen.findByText(/expired, revoked, or reached its use limit/i),
    ).toBeVisible();
  });
});
