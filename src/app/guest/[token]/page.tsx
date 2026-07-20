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
  const suggester = invite.role === "guest_suggester";
  const roleName = commenter ? "Commenter" : suggester ? "Suggester" : "Viewer";
  const permission = commenter
    ? "You can view this Plan version and add comments."
    : suggester
      ? "You can view this Plan version and suggest changes for the Crew to review."
      : "You can view this Plan version. Comments and suggestions are off.";

  return (
    <main className="bg-background text-foreground min-h-dvh px-5 py-10 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-xl">
        <p className="text-muted-foreground font-mono text-[0.6875rem] tracking-[0.18em] uppercase">
          Trailie Crew · Guest access
        </p>
        <div
          aria-label="Exact plan version"
          className="border-border bg-surface-raised rounded-control mt-6 inline-flex flex-col border px-4 py-3"
        >
          <span className="text-muted-foreground text-xs">Shared Plan</span>
          <span className="mt-0.5 text-sm font-semibold">
            Version {invite.planVersion}
          </span>
        </div>
        <h1 className="mt-8 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
          Join as a {roleName}
        </h1>
        <p className="text-muted-foreground mt-4 text-lg leading-8">
          {invite.itinerary.title}
        </p>
        <div className="bg-subtle mt-6 rounded-md p-4 text-sm leading-6">
          <p className="font-semibold">{permission}</p>
          <p className="text-muted-foreground mt-1">
            Expires {new Date(invite.expiresAt).toLocaleString()}
          </p>
        </div>
        <GuestEntryForm inviteToken={token} planVersion={invite.planVersion} />
      </div>
    </main>
  );
}
