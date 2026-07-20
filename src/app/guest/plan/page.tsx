import { cookies } from "next/headers";

import { GuestAccessUnavailable } from "@/features/guest-comments/components/guest-access-unavailable";
import { loadGuestSessionContext } from "@/features/guest-comments/repository";
import { PublicItinerary } from "@/features/sharing/components/public-itinerary";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GuestPlanPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("trailie_guest_session")?.value;
  const context = sessionToken
    ? await loadGuestSessionContext(sessionToken)
    : null;
  if (!context) return <GuestAccessUnavailable />;
  const commenter = context.role === "guest_commenter";
  const suggester = context.role === "guest_suggester";

  return (
    <>
      <section
        aria-label="Guest permission"
        className="border-foreground bg-foreground text-background sticky top-0 z-20 border-b px-5 py-3 sm:px-8"
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-xs font-semibold tracking-[0.12em] uppercase">
            Exact Version {context.planVersion} · {context.displayName}
          </p>
          <p className="text-xs font-semibold">
            {commenter
              ? "Commenter · comments enabled"
              : suggester
                ? "Suggester · suggestions enabled"
                : "Viewer · read only"}
          </p>
        </div>
      </section>
      <PublicItinerary
        itinerary={context.itinerary}
        generatedAt={context.itinerary.publishedAt}
        commenting={{
          mode: commenter ? "guest_commenter" : "guest_viewer",
          comments: context.comments,
        }}
        suggesting={
          suggester ? { suggestions: context.suggestions } : undefined
        }
      />
    </>
  );
}
