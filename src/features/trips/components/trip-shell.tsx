"use client";

import {
  ArrowLeft,
  CalendarRange,
  Map,
  MessageCircle,
  Route,
  Settings,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/shared/brand-mark";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { buttonClassName } from "@/components/ui/product-controls";
import { CrewList } from "@/features/crew/components/crew-list";
import { getActiveRoomParticipantsAction } from "@/features/crew/actions/crew-actions";
import type { TripShellData } from "@/features/crew/queries/trip-crew";
import { InvitePanel } from "@/features/trips/components/invite-panel";
import { ChatExperience } from "@/features/chat/components/chat-experience";
import { PlanExperience } from "@/features/planning/components/plan-experience";
import { AccountSettings } from "@/features/lifecycle/account-settings";
import { TripDangerZone } from "@/features/lifecycle/trip-danger-zone";

const destinations = [
  { label: "Chat", icon: MessageCircle },
  { label: "Plan", icon: CalendarRange },
  { label: "Map", icon: Map },
  { label: "Settings", icon: Settings },
];

/** "Account" is reachable from Trip settings but is not a nav destination —
    it is account-scoped, so it does not belong beside the Trip sections. */
type Area = "Chat" | "Plan" | "Map" | "Settings" | "Account";

export function TripShell({ data }: { data: TripShellData }) {
  const [participants, setParticipants] = useState(data.participants);
  const [currentParticipant, setCurrentParticipant] = useState(
    data.currentParticipant,
  );
  const liveData = { ...data, currentParticipant, participants };
  const isHost = currentParticipant.role === "host";
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
  const refreshCrew = useCallback(async () => {
    const result = await getActiveRoomParticipantsAction(data.room.id);
    if (!result.ok) return;
    setParticipants(result.data);
    setCurrentParticipant(
      result.data.find(
        (participant) => participant.id === data.currentParticipant.id,
      ) ?? data.currentParticipant,
    );
  }, [data.currentParticipant, data.room.id]);

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
    <main className="bg-background text-foreground min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)_18rem]">
      <a href="#trip-content" className="skip-link">
        Skip to Trip content
      </a>
      {/* Sticky, self-start, fixed height: as a stretched grid item the rail
          would scroll away with the page on tall areas like Settings. */}
      <aside className="border-border bg-surface hidden border-r px-5 py-6 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:self-start lg:overflow-y-auto">
        <Link
          href="/"
          className="focus-visible:ring-ring flex items-center gap-3 rounded-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          <BrandMark className="size-6" />
          <span className="text-sm font-semibold">Trailie Crew</span>
        </Link>
        <div className="mt-12">
          <p className="eyebrow">Current Trip</p>
          <h1 className="mt-3 text-2xl leading-7 font-semibold tracking-[-0.04em]">
            {data.room.name}
          </h1>
          <p className="text-muted-foreground mt-3 text-xs">
            {data.room.currentPlanVersion
              ? `Current plan · Version ${data.room.currentPlanVersion}`
              : "Planning together"}
          </p>
        </div>
        <nav aria-label="Trip sections" className="mt-12 space-y-1">
          {destinations.map(({ label, icon: Icon }) => {
            const active = area === label;
            return (
              <button
                type="button"
                key={label}
                onClick={() => setArea(label as Area)}
                aria-current={active ? "page" : undefined}
                className={`rounded-control focus-visible:ring-ring flex min-h-11 w-full items-center gap-3 px-3 text-sm focus-visible:ring-2 focus-visible:outline-none ${active ? "bg-accent-soft text-accent font-semibold" : "text-muted-foreground hover:bg-subtle hover:text-foreground"}`}
              >
                <Icon
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={1.75}
                />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Chat is bound to the viewport so its history scrolls inside the pane
          and the composer stays pinned. Plan, Map, and Settings are documents,
          so they keep their natural height and let the page scroll. */}
      <section
        id="trip-content"
        className={`flex min-w-0 flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom))] lg:pb-0 ${
          area === "Chat" ? "h-dvh overflow-hidden" : "min-h-dvh"
        }`}
      >
        <header className="border-border bg-background/95 sticky top-0 z-10 flex min-h-16 items-center justify-between border-b px-4 backdrop-blur-sm sm:px-6">
          <div className="min-w-0 lg:hidden">
            <p className="truncate text-sm font-semibold">{data.room.name}</p>
            <p className="text-muted-foreground mt-0.5 text-[0.6875rem]">
              {data.room.currentPlanVersion
                ? `Version ${data.room.currentPlanVersion}`
                : "Planning together"}
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
                    ? "Trip map"
                    : "Trip settings"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              ref={peopleButtonRef}
              type="button"
              onClick={() => setPeopleOpen(true)}
              className="border-border hover:bg-subtle focus-visible:ring-ring rounded-control inline-flex size-10 items-center justify-center border focus-visible:ring-2 lg:hidden"
              aria-label="People"
            >
              <UsersRound aria-hidden="true" className="size-4" />
            </button>
            <ThemeToggle />
          </div>
        </header>
        {area === "Chat" ? (
          <ChatExperience
            data={liveData}
            onPresenceChange={handlePresenceChange}
            onCrewChange={refreshCrew}
          />
        ) : area === "Plan" || area === "Map" ? (
          <PlanExperience
            roomId={data.room.id}
            participantId={currentParticipant.id}
            participantRole={currentParticipant.role}
            preferMap={area === "Map"}
            onOpenPlan={() => setArea("Plan")}
          />
        ) : area === "Account" ? (
          <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
            <button
              type="button"
              onClick={() => setArea("Settings")}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-control mb-8 inline-flex items-center gap-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back to Trip settings
            </button>
            <AccountSettings />
          </div>
        ) : isHost ? (
          <TripDangerZone
            onOpenAccount={() => setArea("Account")}
            roomId={data.room.id}
            roomName={data.room.name}
            roomCode={data.room.roomCode}
            participants={participants}
            onOpenPlan={() => setArea("Plan")}
          />
        ) : (
          <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
            <p className="eyebrow">Trip settings</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">
              Manage this Trip
            </h2>
            <p className="text-muted-foreground mt-3 text-sm leading-6">
              Only the current host can transfer the host role or delete this
              Trip.
            </p>
            <section className="border-border bg-surface-raised rounded-card mt-8 border p-5">
              <p className="eyebrow">Data</p>
              <h3 className="mt-2 text-base font-semibold">Account data</h3>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                Download your data or manage your Trailie Crew account.
              </p>
              <button
                type="button"
                onClick={() => setArea("Account")}
                className={buttonClassName({
                  variant: "secondary",
                  className: "mt-4",
                })}
              >
                Open account settings
              </button>
            </section>
          </div>
        )}
      </section>

      <aside className="border-border bg-surface hidden border-l px-5 py-6 lg:sticky lg:top-0 lg:block lg:h-dvh lg:self-start lg:overflow-y-auto">
        <CrewList data={liveData} onlineParticipantIds={onlineParticipantIds} />
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
              Trip code
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
                className="border-border focus-visible:ring-ring rounded-control flex size-9 items-center justify-center border focus-visible:ring-2 focus-visible:outline-none"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <CrewList
              data={liveData}
              onlineParticipantIds={onlineParticipantIds}
            />
          </aside>
        </div>
      ) : null}

      <nav
        aria-label="Trip sections"
        className="border-border bg-background fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {destinations.map(({ label, icon: Icon }) => {
          const active = area === label;
          return (
            <button
              type="button"
              key={label}
              onClick={() => setArea(label as Area)}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] ${active ? "text-accent font-semibold" : "text-muted-foreground"}`}
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
