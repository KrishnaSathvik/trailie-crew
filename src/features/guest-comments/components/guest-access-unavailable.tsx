export function GuestAccessUnavailable() {
  return (
    <main className="bg-background text-foreground flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <p className="text-muted-foreground font-mono text-[0.6875rem] tracking-[0.18em] uppercase">
          Trailie Crew · Guest plan
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
          Guest access unavailable
        </h1>
        <p className="text-muted-foreground mx-auto mt-5 max-w-md leading-7">
          This guest access is expired, revoked, or replaced. Ask the trip host
          for a new link.
        </p>
      </div>
    </main>
  );
}
