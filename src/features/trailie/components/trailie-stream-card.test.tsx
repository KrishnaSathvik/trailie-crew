import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TrailieStreamCard } from "./trailie-stream-card";

describe("Trailie provider reliability state", () => {
  it.each([
    ["retrying", "Trailie is trying that again…"],
    ["recovering", "Trailie is checking the trip…"],
  ] as const)("announces the %s state", (status, copy) => {
    render(
      <TrailieStreamCard
        body=""
        status={status}
        stage="checking_trip"
        errorCode={null}
        retryable={false}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(copy);
  });

  it("offers one retry only when the server classified it as safe", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <TrailieStreamCard
        body=""
        status="failed"
        stage="preparing_answer"
        errorCode="model_timeout"
        retryable
        onCancel={vi.fn()}
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(
      <TrailieStreamCard
        body=""
        status="failed"
        stage="preparing_answer"
        errorCode="recovery_required"
        retryable={false}
        onCancel={vi.fn()}
        onRetry={onRetry}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/still checking/i);
  });

  it("uses safe terminal copy without exposing provider details", () => {
    render(
      <TrailieStreamCard
        body=""
        status="failed"
        stage="preparing_answer"
        errorCode="retry_exhausted"
        retryable={false}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Trailie could not answer right now. Try again.",
    );
  });

  it("announces a real operational stage and offers Stop while active", () => {
    const onCancel = vi.fn();
    render(
      <TrailieStreamCard
        body=""
        status="answering"
        stage="looking_up_current_information"
        errorCode={null}
        retryable={false}
        onCancel={onCancel}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Looking up current information",
    );
    fireEvent.click(screen.getByRole("button", { name: "Stop Trailie" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("keeps cancelled work visible as Stopped with a retry action", () => {
    const onRetry = vi.fn();
    render(
      <TrailieStreamCard
        body="Here is the safe partial answer."
        status="stopped"
        stage="preparing_answer"
        errorCode={null}
        retryable
        onCancel={vi.fn()}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Stopped");
    expect(screen.getByText("Here is the safe partial answer.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
