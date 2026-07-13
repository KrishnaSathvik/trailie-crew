import { Crown } from "lucide-react";

import type { TripShellData } from "@/features/crew/queries/trip-crew";

export function CrewList({ data }: { data: TripShellData }) {
  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Crew Members</h2>
        <span className="text-muted-foreground font-mono text-xs">
          {data.participants.length}
          {data.room.expectedTravelers
            ? ` / ${data.room.expectedTravelers}`
            : ""}
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
                className="bg-subtle border-border flex size-9 shrink-0 items-center justify-center rounded-md border text-xs font-semibold uppercase"
              >
                {participant.displayName.slice(0, 2)}
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
