import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MessageComposer } from "./message-composer";

describe("MessageComposer", () => {
  it("disables empty sends, sends with Enter, and inserts a newline with Shift+Enter", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(true);
    render(<MessageComposer onSend={onSend} />);
    const input = screen.getByLabelText("Message your crew");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    await user.type(input, "Hello crew{shift>}{enter}{/shift}Second line");
    expect(input).toHaveValue("Hello crew\nSecond line");
    await user.type(input, "{enter}");
    expect(onSend).toHaveBeenCalledWith("Hello crew\nSecond line");
    expect(input).toHaveValue("");
  });

  it("retains the draft when sending fails", async () => {
    const user = userEvent.setup();
    render(<MessageComposer onSend={vi.fn().mockResolvedValue(false)} />);
    const input = screen.getByLabelText("Message your crew");
    await user.type(input, "Keep this draft{enter}");
    expect(input).toHaveValue("Keep this draft");
  });

  it("enforces the character limit and reveals the remaining count near it", () => {
    render(<MessageComposer onSend={vi.fn()} />);
    const input = screen.getByLabelText("Message your crew");
    fireEvent.change(input, { target: { value: "x".repeat(3995) } });
    expect(input).toHaveValue("x".repeat(3995));
    expect(screen.getByText("5 characters remaining")).toBeVisible();
    fireEvent.change(input, { target: { value: "x".repeat(4001) } });
    expect(input).toHaveValue("x".repeat(4000));
  });

  it("recognizes @Trailie anywhere in a prose message", () => {
    const { rerender } = render(<MessageComposer onSend={vi.fn()} />);
    const input = screen.getByLabelText("Message your crew");
    fireEvent.change(input, {
      target: { value: "@Trailie compare the options" },
    });
    expect(
      screen.getByText("Trailie will answer after this message is sent"),
    ).toBeVisible();
    rerender(<MessageComposer onSend={vi.fn()} />);
    fireEvent.change(input, {
      target: { value: "lets ask @Trailie what do you think?" },
    });
    expect(
      screen.getByText("Trailie will answer after this message is sent"),
    ).toBeVisible();
  });

  const crew = [
    { id: "p1", displayName: "family trip" },
    { id: "p2", displayName: "Sam" },
  ];

  it("opens a mention picker on @ and filters as you type", async () => {
    const user = userEvent.setup();
    render(<MessageComposer onSend={vi.fn()} participants={crew} />);
    const input = screen.getByLabelText("Message your crew");

    await user.type(input, "hey @");
    expect(screen.getByRole("listbox")).toBeVisible();
    expect(screen.getByRole("option", { name: /Sam/ })).toBeVisible();

    await user.type(input, "fam");
    expect(screen.queryByRole("option", { name: /^Sam$/ })).toBeNull();
    expect(screen.getByRole("option", { name: /family trip/ })).toBeVisible();
  });

  it("keeps the picker open across a space inside a display name", async () => {
    const user = userEvent.setup();
    render(<MessageComposer onSend={vi.fn()} participants={crew} />);
    const input = screen.getByLabelText("Message your crew");

    await user.type(input, "@family ");
    expect(screen.getByRole("option", { name: /family trip/ })).toBeVisible();
  });

  it("inserts the mention on Enter instead of sending", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(true);
    render(<MessageComposer onSend={onSend} participants={crew} />);
    const input = screen.getByLabelText("Message your crew");

    await user.type(input, "hey @fam");
    await user.type(input, "{enter}");

    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue("hey @family trip ");
    expect(screen.queryByRole("listbox")).toBeNull();

    await user.type(input, "{enter}");
    expect(onSend).toHaveBeenCalledWith("hey @family trip");
  });

  it("closes the picker on Escape without sending", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(true);
    render(<MessageComposer onSend={onSend} participants={crew} />);
    const input = screen.getByLabelText("Message your crew");

    await user.type(input, "hey @fam{escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onSend).not.toHaveBeenCalled();
  });
});
