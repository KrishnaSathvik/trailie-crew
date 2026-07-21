import {
  ContactLink,
  LegalPage,
  LegalSection,
} from "@/components/shared/legal-page";
import { trailieContactAddresses } from "@/server/site-configuration";

const sections = [
  "Who can use Trailie Crew",
  "Trips and ownership",
  "Acceptable use",
  "Sharing with guests and the public",
  "Planning only",
  "Your responsibilities",
  "Trailie’s limits",
  "Content and intellectual property",
  "Availability and changes",
  "Ending your use",
  "No warranty",
  "Limits on liability",
  "Contact",
] as const;

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      summary="The agreement between you and Trailie Crew when you use the service."
      lastUpdated="July 2026"
      sections={sections}
    >
      <LegalSection title="Who can use Trailie Crew">
        <p>
          You must be at least 13 years old to use Trailie Crew, and old enough
          to agree to these terms where you live. If you use the service on
          behalf of a group, you confirm you may accept these terms for that
          group. By creating or joining a Trip, you accept these terms.
        </p>
      </LegalSection>

      <LegalSection title="Trips and ownership">
        <p>
          A Trip is shared by its Crew. The host manages membership, sharing
          links, and deletion. You keep the content you contribute; other
          members keep theirs. Because a Trip is collaborative, removing your
          account does not automatically erase a Trip that other members still
          rely on — a sole host must transfer or delete each Trip they host
          first.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>
          Use Trailie Crew lawfully. Do not evade usage limits, attempt to reach
          another Crew’s Trip, upload harmful or unlawful content, harass other
          members, scrape or resell the service, or interfere with how it runs
          for anyone else.
        </p>
      </LegalSection>

      <LegalSection title="Sharing with guests and the public">
        <p>
          When you create a guest or public link you decide who can see that
          Plan version. Anyone holding an active link can open it, so share
          deliberately, revoke links you no longer need, and do not publish
          information about other members that they would not share themselves.
          You are responsible for what you choose to share.
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

      <LegalSection title="Content and intellectual property">
        <p>
          Trailie Crew, its name, and its software remain ours. You keep
          ownership of the content you add, and you grant us the permission
          needed to store, display, and share it in order to run the service for
          you and your Crew. Content drawn from official sources remains subject
          to the terms of those sources.
        </p>
      </LegalSection>

      <LegalSection title="Availability and changes">
        <p>
          The service may change, pause, or be unavailable, and features can be
          added or removed. We may switch Trailie off temporarily to protect the
          service while leaving your existing plans readable. We may update
          these terms; if a change is significant we will update the date above
          and, where practical, tell you in the app.
        </p>
      </LegalSection>

      <LegalSection title="Ending your use">
        <p>
          You may stop using the service and request deletion at any time,
          subject to the shared Trip ownership rules above. We may suspend or
          end access that is abusive, unlawful, or harmful to other members or
          to the service.
        </p>
      </LegalSection>

      <LegalSection title="No warranty">
        <p>
          Trailie Crew is offered as-is, without warranties of any kind. We do
          not promise the service will be uninterrupted, error-free, or that any
          planning information will be accurate, current, or fit for a
          particular trip.
        </p>
      </LegalSection>

      <LegalSection title="Limits on liability">
        <p>
          To the extent the law allows, Trailie Crew is not liable for indirect
          or consequential losses, or for travel costs, missed connections,
          closures, or bookings affected by information shown in the service.
          Nothing here limits any right you have that cannot be limited by law.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about these terms can go to{" "}
          <ContactLink address={trailieContactAddresses.support} />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
