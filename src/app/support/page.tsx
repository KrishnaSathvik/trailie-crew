import { LegalPage, LegalSection } from "@/components/shared/legal-page";

const issues = "https://github.com/KrishnaSathvik/trailie-crew/issues/new";

export default function SupportPage() {
  return (
    <LegalPage
      title="Support and abuse reports"
      summary="A clear path for product help, safety concerns, privacy requests, and abuse reports."
    >
      <LegalSection title="Get help">
        <p>
          For Preview support,{" "}
          <a
            className="text-foreground underline underline-offset-4"
            href={issues}
            rel="noreferrer"
          >
            open a GitHub issue
          </a>
          . Label the request as product support, inaccurate information,
          privacy/deletion, accessibility, security, or abuse. Do not include
          private trip content or access tokens.
        </p>
      </LegalSection>
      <LegalSection title="Security reports">
        <p>
          If public disclosure could increase harm, do not post exploit details
          or secrets. Use the repository owner’s private security-reporting
          channel when enabled. Revoke affected share links immediately and
          describe only safe reproduction details.
        </p>
      </LegalSection>
      <LegalSection title="Urgent travel situations">
        <p>
          Trailie is not an emergency or safety service. Contact local emergency
          services, official transportation or park authorities, your travel
          provider, or a qualified professional as appropriate.
        </p>
      </LegalSection>
      <LegalSection title="Response expectations">
        <p>
          This controlled Preview has no guaranteed response time or 24-hour
          support. Production launch remains blocked until incident ownership
          and a professionally reviewed contact and escalation policy are
          configured.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
