# WAF, bot protection, and CAPTCHA acceptance

Status on July 16, 2026: **blocked, not accepted**.

The `hosted-acceptance` Vercel custom environment is protected by Vercel Authentication for non-custom-domain deployments and has no standing automation bypass. The Phase 5C inventory is produced with `pnpm test:infrastructure:acceptance`; its redacted local artifact is `output/phase-5c/infrastructure.json`.

## Observed state

- Vercel deployment protection: configured for all deployments except custom domains; zero bypass entries at inventory time.
- Vercel Firewall: the active-config endpoint returned no configuration. No custom WAF, bot, or rate-limit rule has been tested.
- Turnstile: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are absent from `hosted-acceptance`.
- CAPTCHA test mode: `CAPTCHA_TEST_MODE` and `NEXT_PUBLIC_CAPTCHA_TEST_MODE` remain scoped to `hosted-acceptance`. This environment cannot provide real-Turnstile evidence.
- Supabase Auth CAPTCHA: the declaration variable exists, but neither its value nor a real challenge receipt was promoted to acceptance evidence.

## Required acceptance drill

Use a separate protected staging/custom environment with a domain-restricted Turnstile widget and an isolated non-production Supabase project. Keep Vercel Authentication enabled and do not attach an unrestricted public domain. Remove both CAPTCHA test-mode variables, configure the site and server keys, enable Supabase Auth CAPTCHA, deploy, and then record direct evidence for valid, missing, invalid, expired, and replayed challenges. Confirm direct create/join RPC bypass fails.

Start any WAF or bot control in log-only mode where supported. Test a bounded burst against disposable data, verify the intended rejection status and recovery window, and then prove legitimate two-user create/join/chat traffic still succeeds. Record rule identifiers and counts, never IP addresses, cookies, tokens, or request bodies. Disable temporary rules and bypasses after the drill.

Until that drill passes, report Turnstile, WAF, bot protection, and rate limiting as **not accepted**.
