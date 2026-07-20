import { LegalPage, LegalSection } from "@/components/shared/legal-page";

export default function AccuracyPage() {
  return (
    <LegalPage
      title="Accuracy and availability"
      summary="What Trailie’s plans mean—and what they do not guarantee."
    >
      <LegalSection title="Evidence and freshness">
        <p>
          Trailie uses the Crew’s conversation and available travel sources to
          prepare suggestions. A “Verified” label means the listed source was
          checked for that Plan version; it does not mean every real-world fact
          was independently confirmed. Treat estimated and unknown information
          cautiously.
        </p>
      </LegalSection>
      <LegalSection title="Always verify">
        <p>
          Confirm opening hours, prices, availability, routes, travel times,
          reservations, lodging rules, weather, closures, park alerts, entry
          requirements, visas, health guidance, accessibility, and safety
          directly with official sources before travel.
        </p>
      </LegalSection>
      <LegalSection title="No booking">
        <p>
          Trailie does not complete bookings or purchases. Recommendations,
          reservation statuses, links, and availability snapshots are planning
          information only. A booking is complete only when the booking site
          directly confirms it.
        </p>
      </LegalSection>
      <LegalSection title="Report a problem">
        <p>
          Use the Support page to report unsafe, materially inaccurate, or stale
          information. Include a non-sensitive description; never send a private
          share link, password, or private Trip conversation in a public report.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
