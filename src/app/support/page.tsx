import {
  ContactLink,
  LegalCallout,
  LegalPage,
  LegalSection,
} from "@/components/shared/legal-page";
import { trailieContactAddresses } from "@/server/site-configuration";

const tracker = "https://github.com/KrishnaSathvik/trailie-crew/issues/new";

const routes = [
  {
    need: "Product help",
    address: trailieContactAddresses.support,
    detail: "Something is confusing, broken, or not working as described.",
  },
  {
    need: "Incorrect travel information",
    address: trailieContactAddresses.support,
    detail:
      "A stop, time, closure, or source looks wrong, stale, or unsafe. Include the trip name and the day, not a share link.",
  },
  {
    need: "Privacy requests",
    address: trailieContactAddresses.privacy,
    detail: "Access, correction, export, or questions about how data is used.",
  },
  {
    need: "Account or trip deletion",
    address: trailieContactAddresses.privacy,
    detail:
      "You can delete your account from Settings. Write to us if a shared trip blocks it.",
  },
  {
    need: "Security reports",
    address: trailieContactAddresses.security,
    detail:
      "Suspected vulnerabilities or exposed links. Please report privately first.",
  },
] as const;

export default function SupportPage() {
  return (
    <LegalPage
      title="Support"
      summary="Get help with Trailie Crew, report a concern, or ask about your privacy."
      intro={
        <>
          <LegalCallout>
            Trailie Crew is not an emergency or safety service. For urgent
            situations, contact local emergency services, official
            transportation or park authorities, or your travel booking company
            directly.
          </LegalCallout>

          <p className="text-muted-foreground mt-8 max-w-3xl text-[0.9375rem] leading-7">
            Email is the fastest route. Pick the address that matches what you
            need so it reaches the right place.
          </p>

          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {routes.map(({ need, address, detail }) => (
              <li
                key={need}
                className="border-border bg-surface rounded-card border p-4"
              >
                <p className="text-foreground text-sm font-semibold">{need}</p>
                <p className="text-muted-foreground mt-1 text-sm leading-6">
                  {detail}
                </p>
                <p className="mt-3 text-sm">
                  <ContactLink address={address} />
                </p>
              </li>
            ))}
          </ul>
        </>
      }
    >
      <LegalSection title="When to expect a reply">
        <p>
          We aim to respond within 2–3 business days. Support is not monitored
          around the clock. For urgent safety concerns, contact the appropriate
          local or official service directly rather than waiting for a reply.
        </p>
      </LegalSection>

      <LegalSection title="What to include">
        <p>
          Tell us what you expected, what happened, and roughly when.
          Screenshots help. Never send passwords, private trip conversations, or
          public share links in a report — revoke a link first if it has been
          exposed.
        </p>
      </LegalSection>

      <LegalSection title="Public bug reports">
        <p>
          Non-sensitive bugs and feature ideas can be filed on our{" "}
          <a
            className="text-foreground font-medium underline underline-offset-4"
            href={tracker}
            rel="noreferrer"
          >
            public issue tracker
          </a>
          . Anything involving your data, a security concern, or private trip
          content should go to email instead.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
