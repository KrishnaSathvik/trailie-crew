# Submission-Ready README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stale phase-oriented root README with a concise, accurate OpenAI Build Week 2026 submission page for Trailie Crew.

**Architecture:** Keep the root `README.md` as a judge-first overview and route deeper implementation evidence to existing documents. Present Trailie Crew as the collaborative planning surface in the TrailVerse ecosystem while preserving strict read-only isolation and official-source precedence. Explain Codex and GPT-5.6 as complementary parts of the build without attributing authorization, routing, approval, validation, or publication decisions to a model.

**Tech Stack:** Markdown, Mermaid, Next.js 16, React 19, Supabase, OpenAI Responses API with GPT-5.6 Terra/Luna/Sol, Vercel, Vitest, Playwright, pgTAP.

## Global Constraints

- Canonical marketing URL: `https://trailiecrew.com`.
- Canonical application URL: `https://app.trailiecrew.com`.
- TrailVerse URL: `https://www.nationalparksexplorerusa.com`.
- Use exact model IDs: `gpt-5.6-terra`, `gpt-5.6-luna`, and `gpt-5.6-sol`.
- Preserve the existing human + Codex attribution and the substance of the current GPT-5.6 routing table.
- State that official provider evidence remains authoritative and TrailVerse access is read-only.
- Do not claim booking, guaranteed accuracy, professional legal review, paid backup/PITR, or unrestricted operational readiness.
- Describe `@Trailie` as working anywhere in ordinary prose while remaining inactive in code, quotes, emails, escaped text, and longer handles.
- Add no dependencies and change no runtime behavior.

---

### Task 1: Rewrite the root README for submission

**Files:**

- Modify: `README.md`

**Interfaces:**

- Consumes: canonical URLs and TrailVerse configuration from `src/server/site-configuration.ts`; model roles from `.env.example` and `docs/build-week/model-routing.md`; feature boundaries from `docs/build-week/feature-completeness-audit.md` and `docs/production/`.
- Produces: a self-contained repository landing page for judges, contributors, and technical reviewers.

- [ ] **Step 1: Replace the stale opening with the live submission identity**

  Start with `# Trailie Crew`, the tagline “Plan trips together. Ask Trailie when you need help.”, OpenAI Build Week 2026 / Apps for Your Life attribution, and visible links for the marketing site and live app. Remove the statements that Production is undeployed or that the repository is only a proposal.

- [ ] **Step 2: Add the product story and demo path**

  Add compact sections covering the fragmented group-planning problem, Trailie Crew’s conversation-first solution, its differentiators, and this exact demo sequence:

  1. Create a Trip and invite another traveler.
  2. Exchange ordinary Realtime messages while Trailie stays silent.
  3. Mention `@Trailie` anywhere in prose for focused assistance.
  4. Build and approve the shared planning summary.
  5. Generate a validated, versioned itinerary.
  6. Revise with crew approval, compare immutable versions, then share/export an exact version.

- [ ] **Step 3: Explain the TrailVerse ecosystem relationship**

  State that Trailie Crew is the collaborative group-planning surface of the broader TrailVerse ecosystem. Explain that verified NPS evidence can deterministically unlock allowlisted TrailVerse park guides; official evidence wins over curated mappings; Trailie Crew and TrailVerse keep separate deployments/databases; and future knowledge access stays behind `@trailie/trailverse-adapter` or an equivalent read-only API.

- [ ] **Step 4: Add the architecture diagram**

  Add a compact Mermaid flowchart with these relationships:

  ```mermaid
  flowchart LR
    Crew["Crew browsers"] --> App["Next.js 16 · Trailie Crew"]
    App <--> Data["Supabase Auth · Postgres · Realtime"]
    App --> AI["OpenAI Responses API · GPT-5.6"]
    App --> Evidence["Mapbox · OpenWeather · NPS · RIDB"]
    App --> TrailVerse["TrailVerse park guides · read-only"]
  ```

- [ ] **Step 5: Highlight Codex and GPT-5.6**

  Retain human ownership of product direction and decisions. Credit Codex with repository implementation, test-first development, debugging, migrations, security hardening, browser verification, and deployment work. Preserve the model-role table:

  | Role                                                   | Model           |
  | ------------------------------------------------------ | --------------- |
  | Focused crew answers and narrow revision analysis      | `gpt-5.6-terra` |
  | Silent private conversation-memory extraction          | `gpt-5.6-luna`  |
  | Planning summaries, itineraries, and complex revisions | `gpt-5.6-sol`   |

  Explicitly state that application code owns authorization, deterministic invocation, tool permissions, routing, schemas, validation, approvals, and publication.

- [ ] **Step 6: Add technical credibility without phase-history overload**

  Include concise sections for the stack, safety/privacy boundaries, verification commands, local setup, known limitations, and deeper documentation. Retain links to `docs/build-week/codex-collaboration-log.md`, `docs/build-week/model-routing.md`, `docs/build-week/openai-integration.md`, `docs/build-week/architecture.md`, `docs/production/travel-provider-inventory.md`, and `docs/production/`.

- [ ] **Step 7: Remove obsolete narrative**

  Remove the long phase-by-phase implementation chronology from the root README. Keep its useful evidence discoverable through links rather than duplicating it. Ensure no remaining line says Production is undeployed, `@Trailie` must begin a message, the map is only a placeholder, or Codex details will be added later.

- [ ] **Step 8: Run documentation verification**

  Run:

  ```bash
  pnpm exec prettier --check README.md
  pnpm lint
  git diff --check
  rg -n "Production has not been deployed|Production remains undeployed|needs to be at the start|map.*placeholder|will be expanded" README.md
  ```

  Expected: Prettier, lint, and diff checks exit `0`; the stale-claim search returns no matches.

- [ ] **Step 9: Verify local Markdown links**

  Extract every relative Markdown target beginning with `docs/` and confirm each target exists. Review all external URLs for correct spelling and HTTPS.

- [ ] **Step 10: Review and commit**

  Review `git diff -- README.md` against `docs/superpowers/specs/2026-07-21-submission-readme-design.md`, confirm the existing Codex/GPT-5.6 contribution remains represented, and commit only the README plus this plan if it is not already tracked:

  ```bash
  git add README.md docs/superpowers/plans/2026-07-21-submission-readme.md
  git commit -m "Prepare README for Build Week submission"
  ```
