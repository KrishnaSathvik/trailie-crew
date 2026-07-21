import { ArrowRight, Menu } from "lucide-react";
import Link from "next/link";

import { ThemeToggle } from "./theme-toggle";
import { buttonClassName } from "@/components/ui/product-controls";
import { BrandMark } from "./brand-mark";
import { applicationBaseUrl, legalPaths } from "@/server/site-configuration";

const navigation = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Accuracy", href: legalPaths.accuracy },
  { label: "Support", href: legalPaths.support },
] as const;

function Brand() {
  return (
    <Link
      href="/"
      className="focus-visible:ring-ring rounded-control inline-flex min-h-10 items-center gap-3 focus-visible:ring-2"
      aria-label="Trailie Crew home"
    >
      <BrandMark className="size-6" />
      <span className="text-sm font-semibold tracking-[-0.02em]">
        Trailie Crew
      </span>
    </Link>
  );
}

/**
 * `showCreateCta` is off on the landing page, where the hero and closing
 * sections already carry the primary action. Every other page keeps it, since
 * the header is their only route into the product.
 */
export function MarketingHeader({
  showCreateCta = true,
}: {
  showCreateCta?: boolean;
} = {}) {
  return (
    <header className="border-border bg-background/95 sticky top-0 z-30 border-b backdrop-blur-sm">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-4 px-5 sm:px-8 lg:px-12 2xl:max-w-[88rem]">
        <Brand />

        <nav
          aria-label="Main"
          className="text-muted-foreground ml-6 hidden items-center gap-1 text-sm lg:flex"
        >
          {navigation.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="hover:text-foreground focus-visible:ring-ring rounded-control inline-flex min-h-10 items-center px-3 font-medium transition-colors focus-visible:ring-2"
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href={`${applicationBaseUrl}/join`}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-control hidden min-h-10 items-center px-3 text-sm font-semibold transition-colors focus-visible:ring-2 sm:inline-flex"
          >
            Join a Trip
          </Link>
          {/* Wrapped rather than class-toggled: buttonClassName already sets
              inline-flex, which would win over a `hidden` on the same element. */}
          {showCreateCta ? (
            <span className="hidden sm:contents">
              <Link
                href={`${applicationBaseUrl}/create`}
                className={buttonClassName({
                  variant: "primary",
                  compact: true,
                })}
              >
                Create a Trip
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
            </span>
          ) : null}
          <ThemeToggle />

          {/* A native disclosure keeps the small-screen menu server-rendered. */}
          <details className="relative sm:hidden">
            <summary
              aria-label="Open menu"
              className="border-border focus-visible:ring-ring rounded-control flex size-10 cursor-pointer list-none items-center justify-center border marker:content-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden"
            >
              <Menu aria-hidden="true" className="size-4" />
            </summary>
            <div className="border-border bg-surface-raised rounded-card shadow-soft absolute right-0 z-40 mt-2 flex w-56 flex-col gap-1 border p-2">
              {navigation.map(({ label, href }) => (
                <Link
                  key={label}
                  href={href}
                  className="hover:bg-subtle rounded-control flex min-h-11 items-center px-3 text-sm font-medium"
                >
                  {label}
                </Link>
              ))}
              <Link
                href={`${applicationBaseUrl}/join`}
                className="hover:bg-subtle rounded-control border-border mt-1 flex min-h-11 items-center border-t px-3 text-sm font-semibold"
              >
                Join a Trip
              </Link>
              <Link
                href={`${applicationBaseUrl}/create`}
                className={buttonClassName({
                  variant: "primary",
                  className: "mt-1 w-full",
                })}
              >
                Create a Trip
              </Link>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
