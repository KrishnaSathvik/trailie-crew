import { LegalPage, LegalSection } from "@/components/shared/legal-page";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy notice"
      summary="How the Trailie Crew Preview processes and protects trip-planning data."
    >
      <LegalSection title="Scope and status">
        <p>
          This is draft product copy, not a certification or legal opinion.
          Trailie Crew is a collaborative planning assistant currently offered
          under controlled Preview conditions.
        </p>
      </LegalSection>
      <LegalSection title="Data we process">
        <p>
          We process anonymous authentication identifiers, participant display
          names, room memberships, chat messages, reactions, planning decisions,
          itinerary versions, revision actions, share metadata, and limited
          operational records such as safe error codes, latency, workflow state,
          and token counts.
        </p>
        <p>
          AI providers receive the minimum conversation or planning context
          needed for the requested workflow. We do not intentionally log full
          prompts, messages, private room memory, raw model responses, share
          tokens, cookies, authorization headers, or provider keys.
        </p>
      </LegalSection>
      <LegalSection title="Sharing">
        <p>
          Anyone who receives an active public-share link may view its pinned,
          privacy-reduced itinerary snapshot. Treat the link as a secret. A host
          can rotate or revoke it. Deleting a room revokes its shares.
        </p>
      </LegalSection>
      <LegalSection title="Retention, export, and deletion">
        <p>
          Active room data is retained while needed to provide the service.
          Inactive anonymous accounts may be deleted after the documented
          retention period only when they have no active membership, hosted
          room, recoverable job, or share-management obligation. Signed-in users
          can download a versioned personal-data export and request account
          deletion. Sole hosts must transfer or delete hosted rooms first.
        </p>
      </LegalSection>
      <LegalSection title="Security and contact">
        <p>
          We use row-level authorization, server-only provider credentials,
          hashed invitation/share secrets, rate limits, CAPTCHA, and redacted
          operational logging. No system is perfectly secure. Report privacy or
          abuse concerns through the Support page.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
