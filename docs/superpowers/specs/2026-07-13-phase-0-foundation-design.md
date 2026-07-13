# Trailie Crew Phase 0 Foundation Design

## Scope

Phase 0 creates the production-ready repository foundation and a minimal landing-page shell. It does not implement trips, chat, AI orchestration, planning, itineraries, live travel data, authentication, or persistence.

## Architecture

The repository is a lightweight pnpm workspace with a Next.js application at the root and four independently typed internal packages under `packages/*`. The application uses the App Router, React Server Components by default, strict TypeScript, Tailwind CSS, and the `@/*` alias. Client-side JavaScript is limited to the interactive theme toggle.

The package boundaries are functional rather than decorative:

- `@trailie/schemas` owns shared domain schemas and inferred types.
- `@trailie/validation` owns reusable validation results and helpers and depends on schemas.
- `@trailie/travel-tools` owns contracts for future external travel tools; it contains no fake provider implementation.
- `@trailie/trailverse-adapter` owns the future read-only TrailVerse boundary; it contains only read contracts and no write capability.

## Interface and Design System

The landing page presents the Trailie Crew wordmark, the provenance label “A TrailVerse experiment,” the headline “Plan trips together, naturally.”, explanatory copy, two non-operational calls to action, and a theme toggle. The monochrome visual system uses Geist Sans and Geist Mono, restrained radii, hairline borders, high-contrast focus rings, and no gradients, glassmorphism, neon, emoji controls, or simulated product state.

The visual signature is a quiet route-line motif built from borders and typographic waypoints. It suggests collaborative travel planning while remaining neutral and reusable.

## Testing and Verification

The landing-page test is written before the landing shell and must fail because its required branding is absent. The minimal implementation then makes it pass. Phase 0 completes only after fresh successful runs of lint, strict typechecking, Vitest, and the production build.

## Documentation Boundaries

Build Week documentation distinguishes implemented Phase 0 infrastructure from planned product behavior. Prior work records TrailVerse assets and planning materials as pre-existing; all Trailie Crew product code and workflows are Build Week work. No document claims live data, AI orchestration, collaboration, validation, sharing, or export functionality exists yet.

## Repository Operations

All work occurs directly on `main`. Phase 0 creates no commit and performs no push.
