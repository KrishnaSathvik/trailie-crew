import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleUserRound,
  Compass,
  MessageCircle,
  Route,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import { MarketingFooter } from "@/components/shared/marketing-footer";
import { MarketingHeader } from "@/components/shared/marketing-header";
import { TrailIllustration } from "@/components/shared/trail-illustration";
import { buttonClassName } from "@/components/ui/product-controls";
import { applicationBaseUrl } from "@/server/site-configuration";

const steps = [
  {
    title: "Start a trip",
    description: "Name the trip and invite the people planning with you.",
    icon: Compass,
  },
  {
    title: "Plan together",
    description:
      "Keep ideas, questions, preferences, and decisions in one chat.",
    icon: MessageCircle,
  },
  {
    title: "Ask Trailie",
    description: "Bring Trailie in for focused help only when the crew asks.",
    icon: Route,
  },
  {
    title: "Approve and publish",
    description:
      "Review the important choices together before the plan is ready.",
    icon: Check,
  },
] as const;

const differences = [
  {
    title: "Group-first from the start",
    body: "Everyone plans in the same place, with a shared view of what has been decided.",
    icon: UsersRound,
  },
  {
    title: "Trailie waits to be asked",
    body: "Your crew leads the conversation. Trailie joins when a mention or reply calls for help.",
    icon: Route,
  },
  {
    title: "Every published plan has a history",
    body: "Compare changes, revisit an earlier version, and understand how the trip evolved.",
    icon: CalendarDays,
  },
  {
    title: "A clear plan, with sources",
    body: "Official links, checked times, and plain-language evidence stay close to the itinerary.",
    icon: ShieldCheck,
  },
  {
    title: "Guests can help without joining",
    body: "Share a focused view for comments or suggestions while keeping the crew’s chat private.",
    icon: CircleUserRound,
  },
] as const;

export default function Home() {
  return (
    <main className="bg-background text-foreground min-h-dvh">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <MarketingHeader showCreateCta={false} />

      <div id="main-content">
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:px-12 lg:py-24 xl:grid-cols-[minmax(0,0.9fr)_minmax(30rem,1.1fr)] xl:gap-16 2xl:max-w-[88rem]">
          <div>
            <p className="eyebrow">Travel planning for groups</p>
            <h1 className="page-title mt-5 max-w-3xl">
              Plan the trip. Keep everyone together.
            </h1>
            <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-8 text-pretty">
              Talk through the details as a crew, turn decisions into a clear
              itinerary, and bring Trailie in for focused help when you want it.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={`${applicationBaseUrl}/create`}
                className={buttonClassName({
                  variant: "primary",
                  className: "min-h-12 px-5",
                })}
              >
                Create a Trip
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link
                href={`${applicationBaseUrl}/join`}
                className={buttonClassName({
                  variant: "secondary",
                  className: "min-h-12 px-5",
                })}
              >
                <UsersRound aria-hidden="true" className="size-4" />
                Join a Trip
              </Link>
            </div>
            <p className="text-muted-foreground mt-5 text-xs leading-5">
              Start with a name. Dates, destinations, and priorities can come
              from the conversation.
            </p>
          </div>
          <div>
            <TrailIllustration />
            <p className="text-muted-foreground mt-4 text-center text-xs leading-5">
              From the first message to a plan everyone signed off on.
            </p>
          </div>
        </section>

        <section
          id="how-it-works"
          className="border-border bg-subtle scroll-mt-16 border-y"
        >
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-12 2xl:max-w-[88rem]">
            <p className="eyebrow">One shared path</p>
            <h2 className="section-title mt-4">How your crew gets there</h2>
            <div className="border-border mt-10 grid border-y sm:grid-cols-2 lg:grid-cols-4">
              {steps.map(({ title, description, icon: Icon }, index) => (
                <article
                  key={title}
                  className="border-border py-6 sm:px-6 sm:odd:border-r lg:border-r lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Icon
                      aria-hidden="true"
                      className="text-accent size-5"
                      strokeWidth={1.75}
                    />
                    <span className="text-muted-foreground font-mono text-xs">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-6 font-semibold">{title}</h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-6">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:px-12 xl:grid-cols-[0.68fr_1.32fr] xl:gap-20 2xl:max-w-[88rem]">
          <div>
            <p className="eyebrow">Why Trailie Crew</p>
            <h2 className="section-title mt-4">Built for the whole crew</h2>
            <p className="text-muted-foreground mt-5 max-w-md leading-7">
              Most trip tools start with a form or a single planner. Trailie
              Crew starts with the conversation and keeps the result easy to
              trust, share, and change.
            </p>
          </div>
          <div className="border-border divide-y border-y">
            {differences.map(({ title, body, icon: Icon }) => (
              <article
                key={title}
                className="grid gap-3 py-5 sm:grid-cols-[2rem_0.7fr_1.3fr] sm:items-start sm:gap-5"
              >
                <Icon
                  aria-hidden="true"
                  className="text-accent size-5"
                  strokeWidth={1.75}
                />
                <h3 className="font-semibold">{title}</h3>
                <p className="text-muted-foreground text-sm leading-6">
                  {body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-border bg-subtle border-t">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 py-14 sm:px-8 sm:py-16 lg:flex-row lg:items-end lg:px-12 2xl:max-w-[88rem]">
            <div>
              <p className="eyebrow">Your next trip</p>
              <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">
                Give the crew one place to plan.
              </h2>
            </div>
            <Link
              href={`${applicationBaseUrl}/create`}
              className={buttonClassName({
                variant: "primary",
                className: "min-h-12 px-5",
              })}
            >
              Create a Trip
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </section>
      </div>

      <MarketingFooter />
    </main>
  );
}
