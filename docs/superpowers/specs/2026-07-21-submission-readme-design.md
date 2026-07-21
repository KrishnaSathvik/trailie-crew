# Submission README Design

## Goal

Turn the root README into the primary judge-facing overview for Trailie Crew's OpenAI Build Week 2026 submission. A reviewer should understand the product, run the main demo, see its place in the TrailVerse ecosystem, and evaluate the Codex/GPT-5.6 contribution without reading internal phase history.

## Audience and tone

The primary audience is hackathon judges and technical reviewers. The README should be concise, confident, demonstrable, and technically credible. It may describe the live production deployment, but it must not broaden that fact into unsupported claims about bookings, guaranteed travel accuracy, professional legal review, backup/PITR, or unrestricted operational readiness.

## Structure

1. Product name, tagline, category, repository purpose, and live marketing/app links.
2. A short problem/solution statement focused on collaborative decision-making rather than generic itinerary generation.
3. Key capabilities and a reproducible 60-second demo flow.
4. A dedicated TrailVerse ecosystem section describing Trailie Crew as the collaborative planning surface. Explain that official provider evidence remains authoritative, verified NPS sources may produce allowlisted TrailVerse park-guide links, and the applications remain isolated by a read-only adapter/API boundary rather than sharing writable databases.
5. A compact Mermaid architecture diagram showing the browser, Next.js application, Supabase, OpenAI, travel evidence providers, and TrailVerse guide handoff.
6. A prominent Codex and GPT-5.6 section. Attribute product boundaries and final decisions to the human collaborator; attribute test-first implementation, debugging, migrations, verification, and deployment hardening to Codex; list Terra, Luna, and Sol responsibilities accurately. State that application code—not the model—owns authorization, routing, validation, approval, and publication.
7. Technology, safety, privacy, and verification highlights.
8. Local setup, common quality commands, known limitations, and links to deeper documentation.

## Content decisions

- Replace outdated statements that Production is undeployed with current canonical URLs: `https://trailiecrew.com` and `https://app.trailiecrew.com`.
- Describe `@Trailie` as an explicit mention that works anywhere in ordinary prose; retain exclusions for code, quotes, emails, escaped text, and longer handles.
- Keep exact GPT-5.6 model identifiers and the pinned OpenAI SDK version.
- Highlight approval-gated planning, strict structured outputs, deterministic itinerary validation, immutable versions, read-only sharing, ICS, print/PDF, and responsive collaboration.
- Summarize detailed phase history instead of reproducing it. Preserve links to the collaboration log, model-routing documentation, architecture, production documentation, and provider inventory.
- Keep setup instructions executable and secrets server-only.

## Verification

- Check all referenced local files and public routes exist.
- Search the finished README for stale claims such as "Production has not been deployed," "mention must be at the start," or deferred map behavior that is now implemented.
- Run Markdown formatting and repository documentation checks available through the standard lint/build workflow.
- Review the final diff to ensure the pre-existing Codex/GPT-5.6 additions were preserved in substance.
