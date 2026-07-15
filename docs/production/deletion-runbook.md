# Deletion runbook

Use disposable records for lifecycle drills. Never test against the accepted Preview room.

## Room

Offer export first. Verify the requester is the active host, require the exact room name, call the server action/RPC, then confirm the room, invitation, public share, and realtime access all fail from separate sessions. Repeating the request must be safe. If ownership should continue, transfer host under a row lock instead.

## Account

Assess affected rooms. Block while any active hosted room exists. Transfer or delete each hosted room, re-assess, require `DELETE MY ACCOUNT`, prepare database de-identification, globally revoke refresh sessions, soft-delete Auth through the service-role server client, and clear the local session. Confirm cross-room access and export fail.

## Anonymous cleanup

Run protected dry-run; review counts only; verify synthetic active/recoverable/share-bound users are excluded; execute a small bounded batch; inspect deleted/failed counts and content-free audit events. Failures remain eligible for later retry. Stop the schedule if candidate selection is broader than expected.
