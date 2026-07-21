import Link from "next/link";

import {
  legalPaths,
  trailieContactAddresses,
  trailverse,
} from "@/server/site-configuration";

import { BrandMark } from "./brand-mark";

const currentYear = 2026;

export function MarketingFooter() {
  return (
    <footer className="border-border bg-surface border-t">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 sm:py-14 lg:grid-cols-[1.4fr_1fr_1fr] lg:gap-16 lg:px-12 2xl:max-w-[88rem]">
        <div>
          <div className="flex items-center gap-3">
            <BrandMark className="size-6" />
            <p className="text-sm font-semibold tracking-[-0.02em]">
              Trailie Crew
            </p>
          </div>
          <p className="text-muted-foreground mt-3 max-w-xs text-sm leading-6">
            Plan trips together.
          </p>

          <div className="border-border mt-5 max-w-xs border-t pt-4">
            <p className="text-muted-foreground text-sm leading-6">
              Part of{" "}
              <a
                href={trailverse.url}
                rel="noreferrer"
                className="text-foreground font-semibold underline underline-offset-4"
              >
                {trailverse.name}
              </a>{" "}
              — {trailverse.tagline.toLowerCase()}
            </p>
          </div>
        </div>

        <nav aria-label="Trust, legal, and support">
          <p className="eyebrow">Trust</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {[
              ["Privacy", legalPaths.privacy],
              ["Terms", legalPaths.terms],
              ["Accuracy", legalPaths.accuracy],
              ["Support", legalPaths.support],
            ].map(([label, href]) => (
              <li key={label}>
                <Link
                  href={href}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="eyebrow">Contact</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <a
                href={`mailto:${trailieContactAddresses.support}`}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {trailieContactAddresses.support}
              </a>
            </li>
            <li>
              <a
                href={`mailto:${trailieContactAddresses.privacy}`}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {trailieContactAddresses.privacy}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex max-w-7xl flex-col gap-2 px-5 py-5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12 2xl:max-w-[88rem]">
          <p>© {currentYear} Trailie Crew</p>
          <p>
            Planning help only. Always confirm details with official sources.
          </p>
        </div>
      </div>
    </footer>
  );
}
