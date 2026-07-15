import Link from "next/link";

import { AccountDangerZone } from "@/features/lifecycle/account-danger-zone";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export default function SettingsPage() {
  return (
    <main className="bg-background text-foreground min-h-dvh">
      <header className="border-border flex min-h-16 items-center justify-between border-b px-5 sm:px-8">
        <Link href="/" className="font-semibold">
          Trailie Crew
        </Link>
        <ThemeToggle />
      </header>
      <div className="mx-auto max-w-2xl px-5 py-10 sm:px-8">
        <p className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
          Settings
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Your data and account</h1>
        <section className="border-border mt-8 rounded-lg border p-5">
          <h2 className="text-lg font-semibold">Personal data export</h2>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            Download versioned JSON containing your profile, memberships,
            messages, actions, and published plans you may access. Other
            travelers’ private preferences and operational records are excluded.
          </p>
          <a
            href="/api/account/export"
            className="border-border mt-4 inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold"
          >
            Download my data
          </a>
        </section>
        <AccountDangerZone />
        <nav
          aria-label="Legal and support"
          className="text-muted-foreground mt-10 flex flex-wrap gap-x-5 gap-y-3 text-sm"
        >
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/accuracy">Accuracy</Link>
          <Link href="/support">Support</Link>
        </nav>
      </div>
    </main>
  );
}
