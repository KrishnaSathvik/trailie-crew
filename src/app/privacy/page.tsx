import { LegalPage, LegalSection } from "@/components/shared/legal-page";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy notice"
      summary="How Trailie Crew uses and protects the information that makes collaborative trip planning work."
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
      <LegalSection title="Sharing">
        <p>
          Anyone with an active public link can view the specific Plan version
          it opens. Treat guest and public links as private invitations. A Trip
          host can replace or revoke them at any time.
        </p>
      </LegalSection>
      <LegalSection title="Retention, export, and deletion">
        <p>
          Trip information is kept while it is needed to provide the service.
          You can download your personal data or request account deletion from
          Settings. A sole host must transfer or delete each Trip they host
          first so the rest of the Crew is not locked out.
        </p>
      </LegalSection>
      <LegalSection title="Protection and contact">
        <p>
          Access controls, protected invitation links, usage limits, and
          minimized records help protect your information. No service is
          perfectly secure. Report privacy or abuse concerns through Support.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
