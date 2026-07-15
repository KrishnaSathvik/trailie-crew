# Environment Variables

This inventory reflects variables consumed by the current application and its credentialed smoke scripts. Values are never recorded here. Vercel configuration must scope application variables to **Preview** only; Production remains intentionally unconfigured during Phase 5A. Changing a Vercel environment variable requires a new Preview deployment.

## Application runtime

| Variable                               | Requirement                        | Exposure                     | Local use                                     | Preview status                                            | Production | Consumer                                                   |
| -------------------------------------- | ---------------------------------- | ---------------------------- | --------------------------------------------- | --------------------------------------------------------- | ---------- | ---------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | required                           | browser-safe project URL     | injected by `scripts/with-local-supabase.mjs` | configured in Preview                                     | no         | `src/lib/supabase/{browser,server,proxy}.ts`, server admin |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | required                           | browser-safe publishable key | injected by local wrapper                     | configured in Preview                                     | no         | Supabase browser/server/proxy/admin clients                |
| `SUPABASE_SECRET_KEY`                  | required                           | server-only                  | injected from local CLI status                | configured with hosted legacy service-role JWT; sensitive | no         | `src/server/supabase/admin.ts`                             |
| `NEXT_PUBLIC_SITE_URL`                 | required for hosted sitemap origin | browser-safe URL             | defaults to `http://localhost:3000`           | configured to protected alias                             | no         | `src/app/sitemap.ts`                                       |
| `AI_GENERATION_ENABLED`                | required; defaults `true`          | server-only                  | optional                                      | configured `true`; sensitive                              | no         | `src/server/env.ts`, all AI drains                         |
| `RECOVERY_SECRET`                      | required for recovery route        | server-only                  | set only for manual drill                     | configured; sensitive; hosted drill passed                | no         | `src/app/api/internal/recovery/route.ts`                   |
| `MAPBOX_ACCESS_TOKEN`                  | optional                           | server-only                  | live smoke only                               | absent; unavailable-evidence condition                    | no         | itinerary/revision travel-provider construction            |
| `TRAILIE_AI_PROVIDER`                  | required policy; defaults `openai` | server-only                  | local wrapper selects `fake`                  | configured `openai`                                       | no         | `src/server/env.ts`                                        |

## OpenAI runtime

All OpenAI variables are server-only. The key and safety secret are required when `AI_GENERATION_ENABLED=true` and the provider is `openai`. Model, prompt, schema, validator, and timeout values have code defaults but are configured explicitly in Preview to make the deployed contract auditable.

| Variable                          | Default or role                                                       | Preview status                 | Production | Consumer                                                 |
| --------------------------------- | --------------------------------------------------------------------- | ------------------------------ | ---------- | -------------------------------------------------------- |
| `OPENAI_API_KEY`                  | provider credential                                                   | configured; sensitive          | no         | all OpenAI providers and smoke scripts                   |
| `OPENAI_SAFETY_HMAC_SECRET`       | HMAC input for privacy-safe safety identifiers; minimum 32 characters | configured; sensitive          | no         | focused, memory, planning, itinerary, revision workflows |
| `OPENAI_MODEL_CONVERSATION`       | `gpt-5.6-terra`                                                       | configured                     | no         | focused answers and focused smoke                        |
| `OPENAI_MODEL_FLAGSHIP`           | `gpt-5.6-sol`                                                         | configured                     | no         | focused-answer escalation router                         |
| `OPENAI_PROMPT_VERSION`           | `trailie-focused-v1`                                                  | configured                     | no         | focused run accounting                                   |
| `OPENAI_TIMEOUT_MS`               | `30000`                                                               | configured                     | no         | focused provider                                         |
| `OPENAI_MEMORY_MODEL`             | `gpt-5.6-luna`                                                        | configured                     | no         | memory provider/smoke                                    |
| `OPENAI_MEMORY_PROMPT_VERSION`    | `trailie-memory-v1`                                                   | configured                     | no         | memory run accounting                                    |
| `OPENAI_MEMORY_SCHEMA_VERSION`    | `1`                                                                   | configured                     | no         | memory run accounting                                    |
| `OPENAI_MEMORY_TIMEOUT_MS`        | `20000`                                                               | configured                     | no         | memory provider                                          |
| `OPENAI_PLANNING_MODEL`           | `gpt-5.6-sol`                                                         | configured                     | no         | planning provider/smoke                                  |
| `OPENAI_PLANNING_PROMPT_VERSION`  | `trailie-planning-summary-v1`                                         | configured                     | no         | planning run accounting                                  |
| `OPENAI_PLANNING_SCHEMA_VERSION`  | `1`                                                                   | configured                     | no         | planning run accounting                                  |
| `OPENAI_PLANNING_TIMEOUT_MS`      | `90000`                                                               | configured after hosted timing | no         | planning provider                                        |
| `OPENAI_ITINERARY_MODEL`          | `gpt-5.6-sol`                                                         | configured                     | no         | itinerary and revision providers/smokes                  |
| `OPENAI_ITINERARY_PROMPT_VERSION` | `trailie-itinerary-v1`                                                | configured                     | no         | itinerary/revision run accounting                        |
| `OPENAI_ITINERARY_SCHEMA_VERSION` | `1`                                                                   | configured                     | no         | itinerary/revision run accounting                        |
| `ITINERARY_VALIDATOR_VERSION`     | `trailie-itinerary-validator-v1`                                      | configured                     | no         | itinerary/revision validation records                    |
| `OPENAI_ITINERARY_TIMEOUT_MS`     | `180000`                                                              | configured                     | no         | itinerary and revision providers                         |

## Test and tooling only

`TRAILIE_FAKE_ITINERARY_SCENARIO` and `TRAILIE_FAKE_TRAVEL_SCENARIO` are deterministic local-test controls. `PLAYWRIGHT_SKIP_WEBSERVER` and `CI` control test execution. None may be configured in Vercel Preview. `VERCEL_OIDC_TOKEN` is CLI-managed in ignored `.env.local` and is not an application runtime variable.

The former example-only TrailVerse, NPS, Google Places, and public Mapbox variables were removed from `.env.example` because current code does not consume them. No server secret uses a `NEXT_PUBLIC_` prefix, `.env.local` remains ignored, and production variables are intentionally absent.
