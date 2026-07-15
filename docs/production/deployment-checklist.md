# Production deployment checklist

Status: operational draft. Production deployment is not authorized by Phase 5B.

## Release decision

- [ ] All local quality gates and protected-Preview acceptance are green for the exact commit.
- [ ] CAPTCHA is enabled in hosted Supabase Auth and the same Cloudflare Turnstile site is scoped to the Production domain.
- [ ] Production-only secrets and public keys are set in their documented scopes; Preview values are not copied blindly.
- [ ] Vercel Cron, log-alert ownership, Supabase usage alerts, and OpenAI provider budget alerts have named responders and test evidence.
- [ ] The selected Supabase paid plan, automatic backups/PITR, retention, RPO, and RTO are confirmed in the hosted project—not inferred from local dumps.
- [ ] Privacy, terms, accuracy, retention, support, and abuse copy has professional review.
- [ ] Accessibility acceptance has a dated manual screen-reader/zoom record.
- [ ] Security release checklist and migration review are signed off.

## Controlled rollout

1. Create an isolated Production project and capture its pre-migration backup state.
2. Apply migrations forward in timestamp order. Run security and performance advisors.
3. Deploy with `AI_GENERATION_ENABLED=false` and `TRAVEL_PROVIDERS_ENABLED=false`.
4. Run health, auth, CAPTCHA, create/join, room isolation, share, deletion, export, recovery, cleanup dry-run, and client-secret scans using disposable data.
5. Enable AI only after quotas and provider alerts are independently verified.
6. Start limited access, observe error/rate/quota/recovery signals, and widen only after the incident owner accepts the evidence.

Rollback favors application rollback only when schema compatibility is documented. Database incidents use a forward fix or an isolated restore; never run destructive reset commands against Production.
