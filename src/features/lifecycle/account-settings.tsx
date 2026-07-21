import { buttonClassName } from "@/components/ui/product-controls";
import { AccountDangerZone } from "@/features/lifecycle/account-danger-zone";

/**
 * Account-level settings body, shared by the standalone `/settings` route and
 * the in-room account view so opening it from a Trip does not throw you out of
 * the dashboard.
 */
export function AccountSettings() {
  return (
    <>
      <p className="eyebrow">Settings</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
        Your account
      </h1>
      <p className="text-muted-foreground mt-4 text-sm leading-6">
        Export what Trailie Crew holds about you, or close your account for
        good. These settings apply everywhere, not just to one Trip.
      </p>

      <section className="border-border bg-surface-raised rounded-card mt-8 border p-5">
        <p className="eyebrow">Data</p>
        <h2 className="mt-2 text-lg font-semibold">
          Download your account data
        </h2>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          Get a copy of your profile, Trip memberships, messages, and the
          published Plans you can access, across every Trip.
        </p>
        <a
          href="/api/account/export"
          className={buttonClassName({
            variant: "secondary",
            className: "mt-4",
          })}
        >
          Download my data
        </a>
      </section>

      <AccountDangerZone />
    </>
  );
}
