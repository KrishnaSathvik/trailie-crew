import { MarketingFooter } from "@/components/shared/marketing-footer";
import { MarketingHeader } from "@/components/shared/marketing-header";
import { AccountSettings } from "@/features/lifecycle/account-settings";

export default function SettingsPage() {
  return (
    <main className="bg-background text-foreground flex min-h-dvh flex-col">
      <a href="#settings-content" className="skip-link">
        Skip to settings
      </a>
      {/* The shared shell rather than a bespoke header: the footer already
          carries the trust nav, which is what TrustLinks was standing in for
          here even though that component is meant for surfaces read outside
          the app. */}
      <MarketingHeader />

      <div
        id="settings-content"
        className="mx-auto w-full max-w-2xl flex-1 px-5 py-10 sm:px-8 sm:py-14"
      >
        <AccountSettings />
      </div>

      <MarketingFooter />
    </main>
  );
}
