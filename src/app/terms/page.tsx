import { LegalPage, LegalSection } from "@/components/shared/legal-page";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      summary="Conditions for using Trailie Crew as a planning assistant."
    >
      <LegalSection title="Using Trailie Crew">
        <p>
          Trailie Crew may change, pause, or be unavailable. Use it lawfully and
          do not evade usage limits, try to access another Trip, publish harmful
          content, or interfere with the service.
        </p>
      </LegalSection>
      <LegalSection title="Planning only">
        <p>
          Trailie does not book or purchase travel, take payment, guarantee
          reservations, or act as a travel agent. Booking links are
          informational. Prices, schedules, inventory, routes, and availability
          can change.
        </p>
      </LegalSection>
      <LegalSection title="Your responsibilities">
        <p>
          You are responsible for verifying critical travel information and for
          content you add or share. Independently verify weather, closures,
          alerts, visas, health requirements, accessibility, safety, transport,
          timing, and reservation terms with authoritative sources.
        </p>
      </LegalSection>
      <LegalSection title="Trailie’s limits">
        <p>
          Trailie’s suggestions may be incomplete, out of date, biased, or
          wrong. Plan checks can catch conflicts but cannot establish every
          real-world fact. Do not rely on Trailie for emergency, medical, legal,
          immigration, or safety decisions.
        </p>
      </LegalSection>
      <LegalSection title="Changes and termination">
        <p>
          You may stop using the service and request deletion, subject to shared
          Trip ownership. We may restrict abusive use or temporarily pause
          Trailie to protect the service for everyone.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
