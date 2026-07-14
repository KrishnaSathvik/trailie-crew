# Plan versioning

Itinerary versions are room-level and independent from planning-summary versions. Version 1 is the first validated publication. Each approved revision candidate targets `base_version + 1`, but becomes published only inside the atomic publication function.

The database enforces one `(room_id, version)` row. Publication locks rows, rejects stale bases, requires PASS validation and change-boundary reports, verifies final confirmations, publishes the candidate, and advances `rooms.current_plan_version` once. Idempotent retries return the already-published version and cannot create a gap.

Published rows are immutable. Earlier versions retain itinerary JSON, plan hash, validation summary, timestamps, and source. Historical reads use membership-checked RPCs and never modify the room pointer. The UI labels source, requester, summary, validation status, and current version. Historical views are read-only; comparisons use the persisted structured diff rather than raw JSON.

A request is stale if its base is no longer current or its hash, approval mode, or required membership changes. Approval and publication stop; users create a new request against the latest plan.
