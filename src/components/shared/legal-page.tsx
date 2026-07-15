import Link from "next/link";
import type { ReactNode } from "react";

import { TrustLinks } from "./trust-links";

export function LegalPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <main className="bg-background text-foreground min-h-dvh">
      <header className="border-border border-b px-5 py-5 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <Link href="/" className="font-semibold">
            Trailie Crew
          </Link>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
          Draft · professional review required
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
          {title}
        </h1>
        <p className="text-muted-foreground mt-5 text-lg leading-8">
          {summary}
        </p>
        <div className="legal-copy mt-10 space-y-8 text-sm leading-7">
          {children}
        </div>
        <TrustLinks className="border-border text-muted-foreground mt-12 flex flex-wrap gap-5 border-t pt-6 text-sm" />
      </article>
    </main>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="text-muted-foreground mt-3 space-y-3">{children}</div>
    </section>
  );
}
