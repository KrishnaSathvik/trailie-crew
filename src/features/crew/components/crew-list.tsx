import { Crown } from "lucide-react";

import type { TripShellData } from "@/features/crew/queries/trip-crew";

export function CrewList({
  data,
  onlineParticipantIds = [],
}: {
  data: TripShellData;
  onlineParticipantIds?: string[];
}) {
  const online = new Set(onlineParticipantIds);
  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Your crew</h2>
        <span
          className="text-muted-foreground font-mono text-xs"
          aria-label={`${online.size} online`}
        >
          {online.size} online
        </span>
      </div>
      <ul className="space-y-4">
        {data.participants.map((participant) => {
          const isCurrent = participant.id === data.currentParticipant.id;
          return (
            <li
              key={participant.id}
              className="flex min-w-0 items-center gap-3"
            >
              <span
                aria-hidden="true"
                className="bg-subtle border-border rounded-control flex size-9 shrink-0 items-center justify-center border text-xs font-semibold uppercase"
              >
                {participant.displayName.slice(0, 2)}
              </span>
              <span className="sr-only">
                {online.has(participant.id) ? "Online" : "Offline"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {participant.displayName}
                {isCurrent ? " (you)" : ""}
              </span>
              {participant.role === "host" ? (
                <Crown
                  aria-label="Host"
                  className="text-muted-foreground size-4"
                  strokeWidth={1.75}
                />
              ) : null}
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full border ${online.has(participant.id) ? "bg-foreground" : "bg-background"}`}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
