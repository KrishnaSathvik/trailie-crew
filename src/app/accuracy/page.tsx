import { LegalPage, LegalSection } from "@/components/shared/legal-page";

export default function AccuracyPage() {
  return (
    <LegalPage
      title="Accuracy and availability"
      summary="What Trailie’s plans mean—and what they do not guarantee."
    >
      <LegalSection title="Evidence and freshness">
        <p>
          Trailie currently produces planning suggestions from available
          conversation context and model knowledge. A “verified” label means a
          system validation passed for that exact plan version; it does not mean
          every real-world fact was independently confirmed. Estimated and
          unknown labels should be treated cautiously.
        </p>
      </LegalSection>
      <LegalSection title="Always verify">
        <p>
          Confirm opening hours, prices, availability, routes, travel times,
          reservations, lodging rules, weather, closures, park alerts, entry
          requirements, visas, health guidance, accessibility, and safety
          directly with authoritative providers before travel.
        </p>
      </LegalSection>
      <LegalSection title="No booking">
        <p>
          Trailie does not complete bookings or purchases. Recommendations,
          reservation statuses, links, and availability snapshots are planning
          information only. A booking is complete only when the provider
          directly confirms it.
        </p>
      </LegalSection>
      <LegalSection title="Report a problem">
        <p>
          Use the Support page to report unsafe, materially inaccurate, or stale
          information. Include a non-sensitive description; never send a share
          token, password, authentication header, or private room content in a
          public report.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
