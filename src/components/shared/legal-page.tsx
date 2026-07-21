import { ArrowUp } from "lucide-react";
import type { ReactNode } from "react";

import { MarketingFooter } from "./marketing-footer";
import { MarketingHeader } from "./marketing-header";

/**
 * Shared by the jump list and by `LegalSection` so both derive the same anchor
 * from a title. Curly quotes and apostrophes are stripped, so
 * `What “Verified” means` and `Trailie’s limits` slug cleanly.
 */
export function slugifySectionTitle(title: string) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export function LegalPage({
  title,
  summary,
  lastUpdated,
  sections,
  intro,
  children,
}: {
  title: string;
  summary: string;
  /** Omitted on pages that are not versioned documents, such as Support. */
  lastUpdated?: string;
  sections?: readonly string[];
  /** Full-width content between the header and the section grid. */
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="bg-background text-foreground flex min-h-dvh flex-col">
      <a href="#legal-content" className="skip-link">
        Skip to main content
      </a>
      <MarketingHeader />
      <article
        id="legal-content"
        className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8 sm:py-14 2xl:max-w-6xl"
      >
        <p className="eyebrow">Trailie Crew</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-balance sm:text-5xl">
          {title}
        </h1>
        <p className="text-muted-foreground mt-4 max-w-2xl text-lg leading-8">
          {summary}
        </p>
        {lastUpdated ? (
          <p className="text-muted-foreground border-border mt-6 inline-flex rounded-full border px-3 py-1 font-mono text-[0.6875rem]">
            Last updated {lastUpdated}
          </p>
        ) : null}

        {sections && sections.length > 1 ? (
          <nav
            aria-label="On this page"
            className="border-border bg-surface rounded-card mt-8 border p-4"
          >
            <p className="eyebrow">On this page</p>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {sections.map((sectionTitle) => (
                <li key={sectionTitle}>
                  <a
                    href={`#${slugifySectionTitle(sectionTitle)}`}
                    className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                  >
                    {sectionTitle}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {intro ? <div className="mt-8">{intro}</div> : null}

        <div className="legal-copy mt-10 grid gap-8 text-[0.9375rem] leading-7 sm:grid-cols-[13rem_minmax(0,1fr)]">
          {children}
        </div>

        <a
          href="#legal-content"
          className="text-muted-foreground hover:text-foreground mt-10 inline-flex items-center gap-1.5 text-xs font-medium"
        >
          <ArrowUp aria-hidden="true" className="size-3.5" />
          Back to top
        </a>
      </article>
      <MarketingFooter />
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
    <section
      id={slugifySectionTitle(title)}
      className="border-border grid scroll-mt-20 gap-3 border-t pt-5 sm:col-span-2 sm:grid-cols-subgrid"
    >
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="text-muted-foreground space-y-3">{children}</div>
    </section>
  );
}

/** A callout for the one thing on a page a reader must not miss. */
export function LegalCallout({ children }: { children: ReactNode }) {
  return (
    <div className="border-warning/30 bg-warning-soft rounded-card border p-4 sm:col-span-2">
      <p className="text-foreground text-sm leading-6">{children}</p>
    </div>
  );
}

export function ContactLink({ address }: { address: string }) {
  return (
    <a
      href={`mailto:${address}`}
      className="text-foreground font-medium underline underline-offset-4"
    >
      {address}
    </a>
  );
}
