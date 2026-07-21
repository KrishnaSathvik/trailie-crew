import {
  ContactLink,
  LegalPage,
  LegalSection,
} from "@/components/shared/legal-page";
import { trailieContactAddresses } from "@/server/site-configuration";

const sections = [
  "What this covers",
  "Information we use",
  "Companies that process data for us",
  "Cookies and analytics",
  "Where data is handled",
  "How long we keep it",
  "Your choices",
  "Sharing",
  "Protection and contact",
] as const;

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy notice"
      summary="How Trailie Crew uses and protects the information that makes collaborative trip planning work."
      lastUpdated="July 2026"
      sections={sections}
    >
      <LegalSection title="What this covers">
        <p>
          This notice covers the information used when you create, join, plan,
          comment on, suggest changes to, or share a Trip.
        </p>
      </LegalSection>

      <LegalSection title="Information we use">
        <p>
          We use your display name, Trip membership, chat messages, reactions,
          planning decisions, Plan versions, comments, suggestions, and sharing
          choices to provide the service.
        </p>
        <p>
          Trailie receives only the conversation or planning details needed to
          answer a request or prepare a Plan. Sensitive access information is
          not included in those requests.
        </p>
      </LegalSection>

      <LegalSection title="Companies that process data for us">
        <p>
          We rely on a small number of companies to run the service. They
          process data only to deliver their part of it, under contract:
        </p>
        <ul className="mt-3 space-y-1.5">
          <li>Supabase — database, authentication, and file storage</li>
          <li>Vercel — application hosting and delivery</li>
          <li>OpenAI — generating Trailie’s planning responses</li>
          <li>Mapbox — map rendering and place lookup</li>
          <li>Cloudflare — abuse prevention on sign-in and sharing</li>
        </ul>
        <p>
          We do not sell personal information, and we do not use your Trip
          content to train external systems.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and analytics">
        <p>
          We use only the storage needed to keep you signed in and remember your
          theme choice. There are no advertising cookies and no third-party
          tracking scripts. Usage analytics are currently switched off; if that
          changes, this notice will be updated first.
        </p>
      </LegalSection>

      <LegalSection title="Where data is handled">
        <p>
          Trailie Crew is operated from the United States, and the companies
          listed above may process data in the United States and other
          countries. Wherever your information is handled, the same access
          controls and retention rules apply.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <p>
          Trip information is kept while it is needed to provide the service.
          Accounts created without signing up are removed automatically after
          about 30 days of inactivity, along with the Trips only they hold.
          Deleting your account removes your personal data; Trips you shared
          with others follow the ownership rules below.
        </p>
      </LegalSection>

      <LegalSection title="Your choices">
        <p>
          You can download your personal data or request account deletion from
          Settings. You can also ask us to correct information, explain how it
          is used, or restrict a particular use. A sole host must transfer or
          delete each Trip they host first, so the rest of the Crew is not
          locked out.
        </p>
        <p>
          Depending on where you live, you may have additional rights over your
          personal data. Write to{" "}
          <ContactLink address={trailieContactAddresses.privacy} /> and we will
          help.
        </p>
      </LegalSection>

      <LegalSection title="Sharing">
        <p>
          Anyone with an active public link can view the specific Plan version
          it opens. Treat guest and public links as private invitations. A Trip
          host can replace or revoke them at any time.
        </p>
      </LegalSection>

      <LegalSection title="Protection and contact">
        <p>
          Access controls, protected invitation links, usage limits, and
          minimized records help protect your information. No service is
          perfectly secure. For privacy questions or requests, contact{" "}
          <ContactLink address={trailieContactAddresses.privacy} />. To report
          abuse or a security concern, see Support.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
