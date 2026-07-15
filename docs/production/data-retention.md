# Data retention

Status: draft; professional privacy/legal review required.

Active rooms retain collaborative messages, decisions, plan versions, revisions, and privacy-reduced share state needed to provide the service. Private room memory is room-scoped and never included in public shares or another participant’s export.

Anonymous cleanup defaults to 30 days and selects only anonymous Auth users older than retention with no active membership, active hosted room, recoverable AI/planning/itinerary/revision work, or active share-management obligation. Cleanup uses dry-run, bounded batches, leases, soft Auth deletion, retryable failure records, and content-free audit summaries.

Room deletion is host-only, explicitly confirmed, atomic through cascades, and immediately removes invitations, shares, room access, chat, memory, planning, itineraries, revisions, exports, and room-owned operational rows. A content-free hashed deletion event is retained.

Account deletion requires resolving hosted rooms. It removes active memberships, de-identifies the participant label, removes participant-attributed private memory, revokes refresh sessions, and soft-deletes the anonymous Auth user. Existing short-lived access JWTs may remain cryptographically valid until expiry, but active-membership RLS and server `getUser` checks remove private access immediately. Shared plan history may remain only in de-attributed form where required for the other room participants.

Operational quota/deletion summaries contain identifiers only where required for transactional enforcement and use cascades or hashed subjects. Precise legal retention, deletion-event lifetime, backup erasure behavior, and support request records remain subject to professional review.
