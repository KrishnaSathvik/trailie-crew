import { LegalPage, LegalSection } from "@/components/shared/legal-page";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Preview use"
      summary="Conditions for using Trailie Crew as a planning assistant."
    >
      <LegalSection title="Preview service">
        <p>
          Trailie Crew may change, pause, or be unavailable. Use it lawfully and
          do not automate account creation, evade limits, probe other rooms,
          publish harmful content, or interfere with service operation.
        </p>
      </LegalSection>
      <LegalSection title="Planning only">
        <p>
          Trailie does not book or purchase travel, take payment, guarantee
          reservations, or act as a travel agent. Provider names or links are
          informational handoffs. Prices, schedules, inventory, routes, and
          availability can change.
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
      <LegalSection title="AI limitations">
        <p>
          AI output may be incomplete, stale, biased, or wrong. Validation
          checks structure and internal consistency; it does not establish
          real-world truth. Do not rely on Trailie for emergency, medical,
          legal, immigration, or safety decisions.
        </p>
      </LegalSection>
      <LegalSection title="Changes and termination">
        <p>
          You may stop using the service and request deletion subject to
          shared-room ownership rules. We may restrict abusive use or disable
          generation to protect reliability and cost. This draft requires
          professional review before public Production launch.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
