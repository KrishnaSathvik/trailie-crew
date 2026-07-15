# Preview Deployment and Migration Runbook

## Safety boundary

Phase 5A targets only the dedicated Vercel project `trailie-crew-preview` and a separate non-production Supabase project. It uses no production domain or customer data. Production environment variables remain absent and `vercel --prod` is prohibited.

Current Vercel configuration:

- account/team: `ShadowDevil's projects`;
- framework: Next.js;
- root: repository root;
- Vercel plan/runtime: Pro with Fluid Compute enabled in `iad1`;
- Node.js: 24.x, compatible with repository requirement `>=22`;
- install: `pnpm install --frozen-lockfile`;
- build: `pnpm build`;
- output: framework-managed;
- custom environment: `hosted-acceptance` (Preview type), protected alias `trailie-crew-preview-shadowdevil-shadowdevils-projects-ae938de8.vercel.app`;
- deployment protection: Vercel Authentication for deployment URLs, Git fork protection enabled;
- Git integration: intentionally not connected before Preview because linking `main` could trigger a Production deployment;
- function runtimes: Node.js; focused route `maxDuration=60`; authenticated Trip actions and their `after()` work plus recovery use `maxDuration=300`. Hosted planning, itinerary, repair, and revision timing remained within these limits.

## Hosted Supabase procedure

1. Authenticate the CLI and select/create a dedicated non-production project in an appropriate documented region. Phase 5A uses `tkccksmiuucdstvvfglp` in `us-east-1` on PostgreSQL `17.6.1.141`.
2. Confirm PostgreSQL 17 matches `supabase/config.toml`, Auth and Realtime are enabled, anonymous sign-in is allowed only for protected Preview, and no fixture/customer data exists. These checks passed for the Phase 5A project.
3. Configure Site URL and exact Preview redirect URLs. Keep Data API schemas to `public` and `graphql_public`; never expose `private`.
4. Confirm required extensions and hosted backup status before representative data.
5. Link by project reference, review migration history, then run `supabase db push` without reset or destructive repair.
6. Verify all migrations in order, tables/enums/functions/triggers, RLS on application tables, forced RLS on private tables, empty `SECURITY DEFINER` search paths, grants, private Realtime policies, and service/browser RPC boundaries.
7. Run hosted security advisors and targeted catalog/grant queries. Local pgTAP is supporting evidence only.

All 11 committed migrations were applied in order. Hosted catalog checks confirmed RLS on application tables, forced RLS on private tables, expected functions/triggers/enums, empty definer search paths, and private Realtime authorization. The hosted legacy service-role JWT is required by the current server client; the newer hosted secret key returned 401 for required table/admin operations in direct acceptance.

## Failure response and forward fixes

Stop before application deployment if migration history diverges, backup status is unknown, a private schema is exposed, RLS/grants differ, or any destructive command would be required. Preserve logs and schema evidence without secrets. Fix the migration locally, rerun reset/pgTAP/lint/advisors, commit the forward migration, and apply it normally. Down migrations and destructive rollback are not assumed.

Supabase Free does not provide automatic project backups/PITR. Manual pre-acceptance schema and data dumps were created under ignored `output/phase-5a/backups/`; the data dump reports circular-FK restore considerations. No RPO/RTO is claimed. Automatic backups and a restore drill remain production blockers.

## Preview deployment procedure

1. Confirm a clean pushed commit and all local gates.
2. Confirm only Preview-scoped hosted Supabase, OpenAI, recovery, site URL, AI switch, and optional Mapbox variables; verify fake/test/local values and all Production variables are absent.
3. Reconfirm Vercel Authentication and no custom domain.
4. Build locally and scan routes/browser chunks.
5. deploy to the custom environment with `vercel deploy --target=hosted-acceptance`; never pass `--prod`. The accepted deployment is `dpl_G28HMEw1NBuY5F4e4KpGnBq7cHms`.
6. Inspect build/function configuration and headers before running authenticated acceptance.
7. If acceptance fails, keep protection enabled, apply a tested forward fix, and create a new Preview deployment. Do not promote the failed deployment.
