"use client";

import {
  CalendarRange,
  Map,
  MessageCircle,
  Route,
  Settings,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ThemeToggle } from "@/components/shared/theme-toggle";
import { CrewList } from "@/features/crew/components/crew-list";
import type { TripShellData } from "@/features/crew/queries/trip-crew";
import { InvitePanel } from "@/features/trips/components/invite-panel";
import { ChatExperience } from "@/features/chat/components/chat-experience";
import { PlanExperience } from "@/features/planning/components/plan-experience";
import { TripDangerZone } from "@/features/lifecycle/trip-danger-zone";

const destinations = [
  { label: "Chat", icon: MessageCircle, enabled: true },
  { label: "Plan", icon: CalendarRange, enabled: true },
  { label: "Settings", icon: Settings, enabled: true },
  { label: "Map", icon: Map, enabled: true },
];

type Area = "Chat" | "Plan" | "Map" | "Settings";

export function TripShell({ data }: { data: TripShellData }) {
  const isHost = data.currentParticipant.role === "host";
  const [onlineParticipantIds, setOnlineParticipantIds] = useState<string[]>(
    [],
  );
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [area, setArea] = useState<Area>("Chat");
  const peopleButtonRef = useRef<HTMLButtonElement>(null);
  const closePeopleRef = useRef<HTMLButtonElement>(null);
  const handlePresenceChange = useCallback((participantIds: string[]) => {
    setOnlineParticipantIds(participantIds);
  }, []);

  useEffect(() => {
    if (!peopleOpen) return;
    const trigger = peopleButtonRef.current;
    closePeopleRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPeopleOpen(false);
      if (event.key !== "Tab") return;
      const dialog = closePeopleRef.current?.closest('[role="dialog"]');
      const controls = dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [peopleOpen]);

  return (
    <main className="bg-background text-foreground min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)_19rem]">
      <aside className="border-border hidden min-h-dvh border-r px-6 py-7 lg:flex lg:flex-col">
        <Link
          href="/"
          className="focus-visible:ring-ring flex items-center gap-3 rounded-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          <span aria-hidden="true" className="bg-foreground size-2.5" />
          <span className="text-sm font-semibold">Trailie Crew</span>
        </Link>
        <div className="mt-14">
          <p className="text-muted-foreground font-mono text-[0.625rem] tracking-[0.16em] uppercase">
            Current Trip
          </p>
          <h1 className="mt-3 text-2xl leading-7 font-semibold tracking-[-0.04em]">
            {data.room.name}
          </h1>
          <p className="text-muted-foreground mt-3 font-mono text-xs tracking-[0.12em]">
            {data.room.roomCode}
          </p>
        </div>
        <nav aria-label="Trip sections" className="mt-12 space-y-1">
          {destinations.map(({ label, icon: Icon, enabled }) => {
            const active = area === label;
            return (
              <button
                type="button"
                key={label}
                onClick={() => enabled && setArea(label as Area)}
                disabled={!enabled}
                className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm ${active ? "bg-subtle font-semibold" : "text-muted-foreground"}`}
              >
                <Icon
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={1.75}
                />
                <span>{label}</span>
                {!enabled ? (
                  <span className="ml-auto font-mono text-[0.5625rem] tracking-wider uppercase">
                    Soon
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="border-border mt-auto border-t pt-5">
          <p className="text-sm font-semibold">
            {data.currentParticipant.displayName}
          </p>
          <p className="text-muted-foreground mt-1 text-xs capitalize">
            {data.currentParticipant.role}
          </p>
        </div>
      </aside>

      <section className="flex min-h-dvh min-w-0 flex-col pb-20 lg:pb-0">
        <header className="border-border flex min-h-16 items-center justify-between border-b px-5 sm:px-7">
          <div className="min-w-0 lg:hidden">
            <p className="truncate text-sm font-semibold">{data.room.name}</p>
            <p className="text-muted-foreground mt-0.5 font-mono text-[0.625rem] tracking-wider">
              {data.room.roomCode}
            </p>
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <Route aria-hidden="true" className="size-4" strokeWidth={1.75} />
            <p className="text-sm font-semibold">
              {area === "Chat"
                ? "Shared conversation"
                : area === "Plan"
                  ? "Planning review"
                  : area === "Map"
                    ? "Spatial itinerary"
                    : "Trip settings"}
            </p>
          </div>
          <ThemeToggle />
        </header>
        {area === "Chat" ? (
          <ChatExperience data={data} onPresenceChange={handlePresenceChange} />
        ) : area === "Plan" || area === "Map" ? (
          <PlanExperience
            roomId={data.room.id}
            participantId={data.currentParticipant.id}
            participantRole={data.currentParticipant.role}
            preferMap={area === "Map"}
          />
        ) : isHost ? (
          <TripDangerZone
            roomId={data.room.id}
            roomName={data.room.name}
            participants={data.participants}
          />
        ) : (
          <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
            <h2 className="text-2xl font-semibold">Trip settings</h2>
            <p className="text-muted-foreground mt-3">
              Only the current host can transfer ownership or delete this trip.
            </p>
            <Link
              href="/settings"
              className="focus-visible:ring-ring mt-6 inline-flex min-h-11 items-center rounded-md underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
            >
              Open account settings
            </Link>
          </div>
        )}
      </section>

      <aside className="border-border hidden border-l px-6 py-7 lg:block lg:min-h-dvh">
        <CrewList data={data} onlineParticipantIds={onlineParticipantIds} />
        {isHost ? (
          <div className="mt-8">
            <InvitePanel
              roomId={data.room.id}
              shortCode={data.inviteMetadata?.shortCode ?? data.room.roomCode}
            />
          </div>
        ) : (
          <div className="border-border mt-8 border-t pt-5">
            <p className="text-muted-foreground font-mono text-[0.625rem] tracking-[0.14em] uppercase">
              Room code
            </p>
            <p className="mt-2 font-mono text-lg font-semibold tracking-[0.12em]">
              {data.room.roomCode}
            </p>
          </div>
        )}
      </aside>

      {peopleOpen ? (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Crew presence"
        >
          <button
            type="button"
            aria-label="Close crew"
            className="absolute inset-0 bg-black/35"
            onClick={() => setPeopleOpen(false)}
          />
          <aside className="bg-background border-border absolute inset-y-0 right-0 w-[min(21rem,88vw)] overflow-y-auto border-l px-5 py-6 shadow-xl">
            <div className="mb-6 flex justify-end">
              <button
                ref={closePeopleRef}
                type="button"
                aria-label="Close crew"
                onClick={() => setPeopleOpen(false)}
                className="border-border focus-visible:ring-ring flex size-9 items-center justify-center rounded-md border focus-visible:ring-2 focus-visible:outline-none"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <CrewList data={data} onlineParticipantIds={onlineParticipantIds} />
          </aside>
        </div>
      ) : null}

      <nav
        aria-label="Trip sections"
        className="border-border bg-background fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t lg:hidden"
      >
        {[
          ...destinations,
          { label: "People", icon: UsersRound, enabled: true },
        ].map(({ label, icon: Icon, enabled }) => {
          const active = area === label;
          return (
            <button
              ref={label === "People" ? peopleButtonRef : undefined}
              type="button"
              key={label}
              onClick={() =>
                label === "People"
                  ? setPeopleOpen(true)
                  : enabled && setArea(label as Area)
              }
              disabled={!enabled}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] ${active ? "font-semibold" : "text-muted-foreground"}`}
            >
              <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}
