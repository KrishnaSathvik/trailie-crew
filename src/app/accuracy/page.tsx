import {
  LegalCallout,
  LegalPage,
  LegalSection,
} from "@/components/shared/legal-page";

const sections = [
  "What “Verified” means",
  "Check with the official source",
  "No booking",
  "Availability",
  "Report a problem",
] as const;

export default function AccuracyPage() {
  return (
    <LegalPage
      title="Accuracy and availability"
      summary="What Trailie’s plans mean—and what they do not guarantee."
      lastUpdated="July 2026"
      sections={sections}
    >
      <LegalCallout>
        Trailie helps organize and verify planning information, but conditions
        can change after a plan is generated. Always confirm time-critical
        details with the official source before you travel.
      </LegalCallout>

      <LegalSection title="What “Verified” means">
        <p>
          A “Verified” label means the listed source was checked at a specific
          moment for that Plan version. It is a timestamp, not a promise. It
          does not mean the fact is guaranteed to still be true when you arrive,
          and it does not mean every real-world detail was independently
          confirmed.
        </p>
        <p>
          Each checked item shows the source it came from and when it was
          checked, so you can judge how much to trust it. Treat “Estimated” and
          “Unknown” items as starting points that still need confirmation.
        </p>
      </LegalSection>

      <LegalSection title="Check with the official source">
        <p>
          Confirm opening hours, prices, availability, routes, travel times,
          reservations, lodging rules, weather, closures, park alerts, entry
          requirements, visas, health guidance, accessibility, and safety
          directly with official sources before travel. Where an official link
          is available, Trailie shows it next to the item so you can go straight
          to it.
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

      <LegalSection title="Availability">
        <p>
          The service may change, pause, or be briefly unavailable, and Trailie
          itself can be switched off while the rest of your plan stays readable.
          Published plans, shares, and exports remain available to you during
          those periods wherever possible.
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
