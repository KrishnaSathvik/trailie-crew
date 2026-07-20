import Link from "next/link";

import { AccountDangerZone } from "@/features/lifecycle/account-danger-zone";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { TrustLinks } from "@/components/shared/trust-links";

export default function SettingsPage() {
  return (
    <main className="bg-background text-foreground min-h-dvh">
      <a href="#settings-content" className="skip-link">
        Skip to settings
      </a>
      <header className="border-border flex min-h-16 items-center justify-between border-b px-5 sm:px-8">
        <Link href="/" className="font-semibold">
          Trailie Crew
        </Link>
        <ThemeToggle />
      </header>
      <div
        id="settings-content"
        className="mx-auto max-w-2xl px-5 py-10 sm:px-8"
      >
        <p className="eyebrow">Settings</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Your account
        </h1>
        <section className="border-border bg-surface-raised rounded-card mt-8 border p-5">
          <p className="eyebrow">Data</p>
          <h2 className="mt-2 text-lg font-semibold">Download your data</h2>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            Get a copy of your profile, Trip memberships, messages, and the
            published Plans you can access.
          </p>
          <a
            href="/api/account/export"
            className="border-border mt-4 inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold"
          >
            Download my data
          </a>
        </section>
        <AccountDangerZone />
        <TrustLinks className="text-muted-foreground mt-10 flex flex-wrap gap-x-5 gap-y-3 text-sm" />
      </div>
    </main>
  );
}
