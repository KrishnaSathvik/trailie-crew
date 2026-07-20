import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "./theme-toggle";
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
      <a href="#legal-content" className="skip-link">
        Skip to main content
      </a>
      <header className="border-border border-b px-5 py-5 sm:px-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link
            href="/"
            className="focus-visible:ring-ring rounded-control inline-flex min-h-10 items-center gap-3 font-semibold focus-visible:ring-2"
          >
            <span
              aria-hidden="true"
              className="bg-accent size-2.5 rounded-[2px]"
            />
            <span>Trailie Crew</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <article
        id="legal-content"
        className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16"
      >
        <p className="eyebrow">Trailie Crew</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-balance sm:text-5xl">
          {title}
        </h1>
        <p className="text-muted-foreground mt-5 text-lg leading-8">
          {summary}
        </p>
        <div className="legal-copy mt-12 grid gap-9 text-sm leading-7 sm:grid-cols-[12rem_minmax(0,1fr)]">
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
    <section className="border-border grid gap-3 border-t pt-5 sm:col-span-2 sm:grid-cols-subgrid">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="text-muted-foreground space-y-3">{children}</div>
    </section>
  );
}
