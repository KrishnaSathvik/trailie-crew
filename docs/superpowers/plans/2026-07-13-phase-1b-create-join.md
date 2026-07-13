# Phase 1B Create and Join Implementation Plan

1. Extend shared contracts for route parsing and Trip-shell results; add typed application errors and RPC error translation with unit tests first.
2. Add a transient invite provider, Supabase session refresh plumbing, and create/join Server Actions with dependency-focused tests.
3. Build accessible create and join forms, invite-route prefill, safe result handling, and functional landing links with component tests first.
4. Build RLS-backed Trip-shell queries, loading and unavailable states, host/member invite behavior, responsive navigation, and shell tests first.
5. Add reliable local-Supabase Playwright coverage for two-user create/join, duplicate-name rejection, crew visibility, and outsider denial.
6. Update build-week documentation, perform the token/auth/RLS/client-boundary security review, and run every requested quality gate without committing.
