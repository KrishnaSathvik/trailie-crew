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

  it("recognizes a verified invocation but stays quiet for product discussion", () => {
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
      target: { value: "The @Trailie feature looks good" },
    });
    expect(
      screen.queryByText("Trailie will answer after this message is sent"),
    ).toBeNull();
  });
});
