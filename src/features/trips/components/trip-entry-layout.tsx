import type { ReactNode } from "react";

import { MarketingFooter } from "@/components/shared/marketing-footer";
import { MarketingHeader } from "@/components/shared/marketing-header";

export function TripEntryLayout({
  eyebrow,
  title,
  description,
  footnote,
  showCreateCta = true,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  footnote: string;
  showCreateCta?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="bg-background text-foreground flex min-h-dvh flex-col">
      <a href="#entry-heading" className="skip-link">
        Skip to form
      </a>
      <MarketingHeader showCreateCta={showCreateCta} />

      {/* Top-anchored rather than vertically centered: centering parks the form
          in the middle of a tall window, with large empty bands above and below. */}
      <div className="mx-auto w-full max-w-md flex-1 px-5 py-12 sm:py-16">
        <p className="eyebrow text-center">{eyebrow}</p>
        <h1
          id="entry-heading"
          className="mt-4 text-center text-4xl font-semibold tracking-[-0.055em] text-balance sm:text-5xl"
        >
          {title}
        </h1>
        <p className="text-muted-foreground mt-4 text-center text-sm leading-6 text-pretty">
          {description}
        </p>

        <div className="border-border bg-surface-raised rounded-card shadow-soft mt-9 border p-6 sm:p-8">
          {children}
        </div>

        <p className="text-muted-foreground mt-5 text-center text-xs leading-5">
          {footnote}
        </p>
      </div>

      <MarketingFooter />
    </main>
  );
}
