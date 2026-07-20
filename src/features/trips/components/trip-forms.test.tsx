import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CreateTripResult } from "@trailie/schemas";
import { describe, expect, it, vi } from "vitest";

import type { TripActionResult } from "../actions/action-types";
import { CreateTripForm } from "./create-trip-form";
import { JoinTripForm } from "./join-trip-form";
import { TransientInviteProvider } from "./transient-invite-provider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const ensureSession = vi.fn().mockResolvedValue({});

function renderForm(element: React.ReactNode) {
  return render(<TransientInviteProvider>{element}</TransientInviteProvider>);
}

const createdTrip = {
  roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
  roomName: "Boundary Waters",
  participantId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
  roomCode: "ABCD2345",
  inviteToken: "a".repeat(43),
  createdAt: "2026-07-13T18:00:00.000Z",
} as const;

describe("CreateTripForm", () => {
  it("renders only the three allowed product fields", () => {
    renderForm(<CreateTripForm />);

    expect(screen.getByLabelText("Trip name")).toBeInTheDocument();
    expect(screen.getByLabelText("Your display name")).toBeInTheDocument();
    expect(screen.getByLabelText(/Expected crew size/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/destination/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/date/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/budget/i)).not.toBeInTheDocument();
  });

  it("shows field errors before calling the action", async () => {
    const action = vi.fn();
    const user = userEvent.setup();
    renderForm(
      <CreateTripForm action={action} ensureSession={ensureSession} />,
    );

    await user.click(screen.getByRole("button", { name: "Create Trip" }));

    expect(await screen.findByText("Enter a Trip name.")).toBeInTheDocument();
    expect(screen.getByText("Enter your display name.")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("validates the expected traveler range", async () => {
    const user = userEvent.setup();
    renderForm(<CreateTripForm ensureSession={ensureSession} />);
    await user.type(screen.getByLabelText("Trip name"), "Boundary Waters");
    await user.type(screen.getByLabelText("Your display name"), "Maya");
    await user.type(screen.getByLabelText(/Expected crew size/), "51");
    await user.click(screen.getByRole("button", { name: "Create Trip" }));
    expect(await screen.findByText(/between 1 and 50/i)).toBeInTheDocument();
  });

  it("locks duplicate submissions and hands off the one-time token", async () => {
    let resolveAction: (
      value: TripActionResult<CreateTripResult>,
    ) => void = () => undefined;
    const action = vi.fn(
      () =>
        new Promise<TripActionResult<CreateTripResult>>(
          (resolve) => (resolveAction = resolve),
        ),
    );
    const onCreated = vi.fn();
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    renderForm(
      <CreateTripForm
        action={action}
        ensureSession={ensureSession}
        onCreated={onCreated}
      />,
    );

    await user.type(screen.getByLabelText("Trip name"), "Boundary Waters");
    await user.type(screen.getByLabelText("Your display name"), "Maya");
    await user.click(screen.getByRole("button", { name: "Create Trip" }));
    await user.click(screen.getByRole("button", { name: "Creating Trip…" }));
    expect(action).toHaveBeenCalledTimes(1);

    resolveAction({ ok: true, data: createdTrip });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdTrip));
    expect(storageSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      createdTrip.inviteToken,
    );
    storageSpy.mockRestore();
  });

  it("renders only a safe mapped error message", async () => {
    const user = userEvent.setup();
    renderForm(
      <CreateTripForm
        action={vi
          .fn()
          .mockResolvedValue({ ok: false, error: "network_error" })}
        ensureSession={ensureSession}
      />,
    );
    await user.type(screen.getByLabelText("Trip name"), "Boundary Waters");
    await user.type(screen.getByLabelText("Your display name"), "Maya");
    await user.click(screen.getByRole("button", { name: "Create Trip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/connection/i);
  });
});

describe("JoinTripForm", () => {
  it("prefills a route invite without rendering the long token", () => {
    const token = "sensitive-token";
    renderForm(<JoinTripForm initialInviteValue={token} />);
    expect(screen.queryByDisplayValue(token)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Your display name")).toBeInTheDocument();
  });

  it.each([
    ["duplicate_membership", /already joined/i],
    ["duplicate_display_name", /display name/i],
    ["invite_expired", /expired/i],
    ["invite_revoked", /revoked/i],
    ["invite_exhausted", /usage limit/i],
    ["invalid_server_response", /could not complete/i],
  ] as const)("shows the safe %s message", async (error, message) => {
    const user = userEvent.setup();
    renderForm(
      <JoinTripForm
        initialInviteValue="ABCD2345"
        action={vi.fn().mockResolvedValue({ ok: false, error })}
        ensureSession={ensureSession}
      />,
    );
    await user.type(screen.getByLabelText("Your display name"), "Leo");
    await user.click(screen.getByRole("button", { name: "Join Trip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});
