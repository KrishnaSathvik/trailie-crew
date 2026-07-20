import { LegalPage, LegalSection } from "@/components/shared/legal-page";

const issues = "https://github.com/KrishnaSathvik/trailie-crew/issues/new";

export default function SupportPage() {
  return (
    <LegalPage
      title="Support"
      summary="Get help with Trailie Crew, report a concern, or ask about your privacy."
    >
      <LegalSection title="Get help">
        <p>
          For help with the product,{" "}
          <a
            className="text-foreground underline underline-offset-4"
            href={issues}
            rel="noreferrer"
          >
            contact support
          </a>
          . Tell us whether you need product help, want to report inaccurate
          information, have a privacy or accessibility request, or need to
          report abuse. Do not include private Trip content or private links.
        </p>
      </LegalSection>
      <LegalSection title="Security reports">
        <p>
          If public disclosure could increase harm, do not post sensitive
          details or private links. Revoke affected sharing links immediately
          and use a private support channel when available.
        </p>
      </LegalSection>
      <LegalSection title="Urgent travel situations">
        <p>
          Trailie is not an emergency or safety service. Contact local emergency
          services, official transportation or park authorities, your travel
          booking company, or a qualified professional as appropriate.
        </p>
      </LegalSection>
      <LegalSection title="When to expect a reply">
        <p>
          Support is not monitored around the clock, and response times may
          vary. For urgent safety concerns, contact the appropriate local or
          official service directly.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
