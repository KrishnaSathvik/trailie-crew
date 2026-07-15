# Production environment variables

No values belong in this document or browser logs.

| Variable                                                        | Visibility              | Preview                                     | Production                      | Purpose                                |
| --------------------------------------------------------------- | ----------------------- | ------------------------------------------- | ------------------------------- | -------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                                      | browser-visible         | Preview project                             | Production project              | Supabase API URL                       |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                          | browser-visible         | Preview key                                 | Production key                  | RLS-bound browser access               |
| `SUPABASE_SECRET_KEY`                                           | server-only             | Preview                                     | Production                      | trusted Auth/admin/RPC work            |
| `NEXT_PUBLIC_SITE_URL`                                          | browser-visible         | protected Preview URL                       | reviewed public URL             | canonical origin                       |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`                                | browser-visible         | Preview-scoped site                         | Production-scoped site          | CAPTCHA widget                         |
| `TURNSTILE_SECRET_KEY`                                          | server-only             | Preview-scoped secret                       | Production-scoped secret        | CAPTCHA verification                   |
| `SUPABASE_AUTH_CAPTCHA_ENABLED`                                 | server-only declaration | `true` only after hosted Auth is configured | `true` required                 | asserts Auth consumed new-user CAPTCHA |
| `CAPTCHA_TEST_MODE`                                             | server-only             | controlled acceptance only                  | forbidden                       | deterministic adapter                  |
| `NEXT_PUBLIC_CAPTCHA_TEST_MODE`                                 | browser-visible         | controlled acceptance only                  | forbidden                       | deterministic widget adapter           |
| `AI_GENERATION_ENABLED`                                         | server-only             | `true`/drill `false`                        | default `false` for rollout     | emergency AI switch                    |
| `TRAVEL_PROVIDERS_ENABLED`                                      | server-only             | `false`                                     | `false` until Phase 6A          | travel-provider circuit breaker        |
| `OPENAI_API_KEY`                                                | server-only             | Preview provider key                        | Production provider key         | provider authentication                |
| `OPENAI_SAFETY_HMAC_SECRET`                                     | server-only             | unique Preview value                        | unique Production value         | pseudonymous safety identifier         |
| `OPENAI_MODEL_*`, `OPENAI_*_TIMEOUT_MS`, prompt/schema versions | server-only             | pinned                                      | pinned                          | workflow routing and runtime bounds    |
| `TRAILIE_AI_PROVIDER`                                           | server-only             | `openai` hosted, `fake` local only          | `openai`                        | provider adapter                       |
| `CRON_SECRET`                                                   | server-only             | manual route protection                     | Vercel-generated/scheduled auth | cron authorization                     |
| `RECOVERY_SECRET`                                               | server-only             | optional distinct secret                    | optional distinct secret        | manual recovery authorization          |
| `CLEANUP_SECRET`                                                | server-only             | optional distinct secret                    | optional distinct secret        | manual cleanup authorization           |
| `ANONYMOUS_RETENTION_DAYS`                                      | server-only             | reviewed test value                         | policy-approved value           | cleanup eligibility age                |
| `ANONYMOUS_CLEANUP_BATCH_SIZE`                                  | server-only             | small batch                                 | bounded reviewed batch          | cleanup runtime bound                  |

Rotate immediately after suspected exposure and at ownership changes. Rotate service/OpenAI/Cron/Turnstile secrets independently, redeploy, verify the old credential fails, and record only the rotation timestamp and owner. A client-bundle scan must allow only `NEXT_PUBLIC_*` keys.
