import { Route, X } from "lucide-react";
import type { TrailieProgressStage } from "@trailie/schemas";

import {
  trailieErrorMessages,
  type TrailieErrorCode,
} from "@/features/trailie/errors/trailie-errors";
import { SafeMarkdownView } from "@/features/trailie/rendering/safe-markdown-view";

const progressCopy: Record<TrailieProgressStage, string> = {
  reading_conversation: "Reading the conversation",
  checking_trip: "Checking the trip",
  looking_up_current_information: "Looking up current information",
  preparing_answer: "Preparing an answer",
  understanding_trip: "Understanding your trip",
  checking_dates_preferences: "Checking dates and preferences",
  building_day_by_day_plan: "Building the day-by-day plan",
  checking_timing_routes: "Checking timing and routes",
  preparing_itinerary: "Preparing the itinerary",
  reviewing_requested_change: "Reviewing the requested change",
  checking_current_plan: "Checking the current plan",
  measuring_impact: "Measuring the impact",
  updating_affected_parts: "Updating the affected parts",
  checking_proposed_changes: "Checking the proposed changes",
  preparing_crew_review: "Preparing crew review",
  finding_verified_locations: "Finding verified locations",
  checking_route_information: "Checking route information",
  preparing_map: "Preparing the map",
  checking_reservation_requirements: "Checking reservation requirements",
  finding_official_booking_options: "Finding official booking options",
  preparing_provider_links: "Preparing provider links",
  taking_longer: "Trailie is taking longer than usual.",
};

export function TrailieStreamCard({
  body,
  status,
  stage,
  errorCode,
  retryable,
  onCancel,
  onRetry,
}: {
  body: string;
  status: "answering" | "retrying" | "recovering" | "stopped" | "failed";
  stage: TrailieProgressStage;
  errorCode: TrailieErrorCode | null;
  retryable: boolean;
  onCancel: () => void;
  onRetry: () => void;
}) {
  return (
    <div
      className="border-accent bg-accent-soft/45 mx-auto mb-5 w-[calc(100%-2rem)] max-w-3xl border-l-2 px-4 py-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold">
          <Route
            aria-hidden="true"
            className="text-accent mr-1.5 inline size-3.5"
          />
          Trailie
        </p>
        {["answering", "retrying", "recovering"].includes(status) ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Stop Trailie"
            className="text-muted-foreground focus-visible:ring-ring rounded-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
      {status === "answering" && !body ? (
        <p className="text-muted-foreground mt-2 text-sm">
          {progressCopy[stage]}
        </p>
      ) : null}
      {status === "retrying" ? (
        <p className="text-muted-foreground mt-2 text-sm">
          Trailie is trying that again…
        </p>
      ) : null}
      {status === "recovering" ? (
        <p className="text-muted-foreground mt-2 text-sm">
          Trailie is checking the trip…
        </p>
      ) : null}
      {status === "stopped" ? (
        <p className="text-muted-foreground mt-2 text-sm">Stopped</p>
      ) : null}
      {body ? (
        <div className="mt-2 break-words" data-testid="trailie-stream-output">
          <SafeMarkdownView markdown={body} />
        </div>
      ) : null}
      {status === "failed" ? (
        <div className="mt-2 text-sm">
          <p role="alert">
            {trailieErrorMessages[errorCode ?? "invocation_failed"]}
          </p>
          {retryable ? (
            <button
              type="button"
              onClick={onRetry}
              className="focus-visible:ring-ring mt-2 text-xs font-semibold underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
      {status === "stopped" && retryable ? (
        <button
          type="button"
          onClick={onRetry}
          className="focus-visible:ring-ring mt-2 text-xs font-semibold underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
