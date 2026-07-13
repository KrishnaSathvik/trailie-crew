# Chat

Phase 1C implements the persisted shared crew conversation. `actions/` owns authenticated RPC boundaries, `queries/` owns the initial safe page, `lib/` owns deterministic state reconciliation, and `components/` owns the private room channel, composer, history, reactions, presence, typing, and responsive ledger.

Trailie behavior, uploads, editing, deletion, moderation, and planning remain outside this boundary.
