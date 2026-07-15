# Security release checklist

- [ ] Hosted Supabase Auth CAPTCHA rejects missing, invalid, expired, and replayed tokens; create/join direct RPC bypass fails.
- [ ] Anonymous, invitation, focused AI, planning, itinerary, revision, share, and export limits are tested; edge/platform controls are configured without raw-IP storage.
- [ ] `AI_GENERATION_ENABLED=false` and database circuit breaker prevent provider calls while human/product read paths work.
- [ ] Quota reservation is transactional and concurrency-tested; actual use/release reconciliation and model/global limits pass.
- [ ] Cleanup excludes active/recoverable/share-bound users and cron overlap is rejected.
- [ ] Room/account deletion authorization, host-transfer locking, session invalidation, idempotency, cascades, and cross-room isolation pass.
- [ ] Public share is unavailable immediately after room deletion.
- [ ] Recovery and cleanup cron authorization cannot leak through URLs/logs; duplicate invocations are safe.
- [ ] All `SECURITY DEFINER` functions use empty `search_path`; grants are minimal; private tables reject browser roles.
- [ ] Logs, exports, public snapshots, and deletion events contain no prompts, private memory/preferences, reasoning, raw provider output, tokens, headers, cookies, keys, or private traveler data.
- [ ] No service-role/Turnstile/OpenAI/Cron secret exists in browser bundles or route output.
- [ ] Legal-page content is static React content without unsafe HTML injection.
- [ ] Dependency audit, secret scan, route manifest, Supabase security/performance advisors, and hosted protected-Preview acceptance are attached to the exact commit.
