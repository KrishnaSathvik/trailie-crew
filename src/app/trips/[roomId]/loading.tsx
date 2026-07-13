export default function TripLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading Trip"
      className="bg-background text-foreground min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)_19rem]"
    >
      <div className="border-border hidden border-r p-6 lg:block">
        <div className="bg-subtle h-5 w-28 animate-pulse rounded-sm" />
      </div>
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
          Loading Trip…
        </p>
      </div>
      <div className="border-border hidden border-l p-6 lg:block">
        <div className="bg-subtle h-5 w-24 animate-pulse rounded-sm" />
      </div>
    </main>
  );
}
