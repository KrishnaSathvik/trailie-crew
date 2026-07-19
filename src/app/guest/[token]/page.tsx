import { GuestAccessUnavailable } from "@/features/guest-comments/components/guest-access-unavailable";
import { GuestEntryForm } from "@/features/guest-comments/components/guest-entry-form";
import { verifyGuestInvite } from "@/features/guest-comments/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GuestInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await verifyGuestInvite(token);
  if (!invite) return <GuestAccessUnavailable />;
  const commenter = invite.role === "guest_commenter";

  return (
    <main className="bg-background text-foreground min-h-dvh px-5 py-10 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-xl">
        <p className="text-muted-foreground font-mono text-[0.6875rem] tracking-[0.18em] uppercase">
          Trailie Crew · Scoped guest access
        </p>
        <div
          aria-label="Exact plan version"
          className="border-foreground mt-6 inline-flex rotate-[-2deg] flex-col border-2 px-4 py-3 font-mono uppercase"
        >
          <span className="text-[0.5625rem] tracking-[0.18em]">Exact plan</span>
          <span className="mt-0.5 text-sm font-bold tracking-[0.08em]">
            Version {invite.planVersion}
          </span>
        </div>
        <h1 className="mt-8 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
          Join as a guest {commenter ? "commenter" : "viewer"}
        </h1>
        <p className="text-muted-foreground mt-4 text-lg leading-8">
          {invite.itinerary.title}
        </p>
        <div className="bg-subtle mt-6 rounded-md p-4 text-sm leading-6">
          <p className="font-semibold">
            {commenter
              ? "You can view this version and add plain-text comments."
              : "You can view this version. Commenting is off."}
          </p>
          <p className="text-muted-foreground mt-1">
            Expires {new Date(invite.expiresAt).toLocaleString()}
          </p>
        </div>
        <GuestEntryForm inviteToken={token} planVersion={invite.planVersion} />
      </div>
    </main>
  );
}
