import Link from "next/link";

export function GuestAccessUnavailable() {
  return (
    <main className="bg-background text-foreground flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <p className="text-muted-foreground font-mono text-[0.6875rem] tracking-[0.18em] uppercase">
          Trailie Crew · Guest plan
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
          This guest link is no longer available
        </h1>
        <p className="text-muted-foreground mx-auto mt-5 max-w-md leading-7">
          This guest access is expired, revoked, or replaced. Ask the Trip host
          for a new link.
        </p>
        <Link
          href="/"
          className="bg-foreground text-background rounded-control mt-7 inline-flex min-h-11 items-center px-4 text-sm font-semibold"
        >
          Return home
        </Link>
      </div>
    </main>
  );
}
