import {
  CalendarRange,
  Map,
  MessageCircle,
  Route,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import { ThemeToggle } from "@/components/shared/theme-toggle";
import { CrewList } from "@/features/crew/components/crew-list";
import type { TripShellData } from "@/features/crew/queries/trip-crew";
import { InvitePanel } from "@/features/trips/components/invite-panel";

const destinations = [
  { label: "Chat", icon: MessageCircle, active: true },
  { label: "Plan", icon: CalendarRange, active: false },
  { label: "Map", icon: Map, active: false },
];

export function TripShell({ data }: { data: TripShellData }) {
  const isHost = data.currentParticipant.role === "host";

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
          {destinations.map(({ label, icon: Icon, active }) => (
            <div
              key={label}
              className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm ${active ? "bg-subtle font-semibold" : "text-muted-foreground"}`}
            >
              <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
              <span>{label}</span>
              {!active ? (
                <span className="ml-auto font-mono text-[0.5625rem] tracking-wider uppercase">
                  Soon
                </span>
              ) : null}
            </div>
          ))}
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
            <p className="text-sm font-semibold">Shared conversation</p>
          </div>
          <ThemeToggle />
        </header>
        <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
          <div className="max-w-md">
            <span className="bg-subtle border-border mx-auto flex size-12 items-center justify-center rounded-md border">
              <MessageCircle
                aria-hidden="true"
                className="size-5"
                strokeWidth={1.5}
              />
            </span>
            <h2 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">
              Chat is coming next
            </h2>
            <p className="text-muted-foreground mt-3 text-sm leading-6">
              Your Trip and crew are connected. Shared conversation, planning,
              and Trailie assistance are intentionally not active yet.
            </p>
          </div>
        </div>
      </section>

      <aside className="border-border border-t px-5 py-7 sm:px-7 lg:min-h-dvh lg:border-t-0 lg:border-l lg:px-6">
        <CrewList data={data} />
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

      <nav
        aria-label="Trip sections"
        className="border-border bg-background fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t lg:hidden"
      >
        {[
          ...destinations,
          { label: "People", icon: UsersRound, active: false },
        ].map(({ label, icon: Icon, active }) => (
          <div
            key={label}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] ${active ? "font-semibold" : "text-muted-foreground"}`}
          >
            <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
            <span>{label}</span>
          </div>
        ))}
      </nav>
    </main>
  );
}
