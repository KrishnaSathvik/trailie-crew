import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TrailieStreamCard } from "./trailie-stream-card";

describe("Trailie provider reliability state", () => {
  it("offers one retry only when the server classified it as safe", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <TrailieStreamCard
        body=""
        status="failed"
        errorCode="model_timeout"
        retryable
        onCancel={vi.fn()}
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry Trailie" }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(
      <TrailieStreamCard
        body=""
        status="failed"
        errorCode="recovery_required"
        retryable={false}
        onCancel={vi.fn()}
        onRetry={onRetry}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Retry Trailie" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/recovery/i);
  });
});
