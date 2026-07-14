# Validation System

Revision candidates reuse every Phase 3B validator and private validation report. Phase 4A adds `trailie-change-boundary-v1`, verifying base hash/version, approved target application, preserved constraints/decisions/rejections, stable unaffected IDs, disclosed downstream shifts, and absence of plan-wide drift. One repair may resolve a conflict without expanding scope.

Phase 3B implements deterministic itinerary validation before publication. The model supplies a proposed `Itinerary`; application code supplies the verdict.

## Pipeline

Validator `trailie-itinerary-validator-v1` runs strict schema and referential checks first, followed by date range, IANA timezone, item ordering, overlaps, travel buffers, arrival/departure feasibility, route duration, daily drive load, hard group constraints, confirmed-decision preservation, rejected-option protection, evidenced opening/reservation facts, coordinates, evidence freshness, budget ceiling, duplicate activities, and public-safe rendering.

Evidence-dependent checks never convert missing provider data into a verified claim. Costs are `verified`, `estimated`, or `unknown`; verified amounts require retrieval time and evidence. HTML, script-like content, arbitrary components, auth/provider identifiers, fake booking confirmations, and unsupported live claims are rejected.

## Outcomes and severity

- `pass`: no critical/high issues; warnings may remain and publication is allowed.
- `needs_revision`: every blocking issue is deterministically repairable; one bounded conflict repair may run.
- `blocked`: contradictory approved inputs, impossible constraints, critical unavailable evidence, or repair that would change an approved decision; publication is forbidden.

Severity is `critical`, `high`, `medium`, `low`, or `info`. Critical/high block. Medium remains blocking unless an explicit rule classifies it as a warning. Every issue has a stable code, safe message, affected item IDs, repairability, and evidence references.

## Repair and publication

The fake-provider demo proves a 3:00 PM activity followed by a 4:00 PM stop with a verified two-hour route becomes `needs_revision`. One repair moves the stop to 5:30 PM, preserves the approved Yosemite/Glacier Point decisions, validates again, and publishes only on `pass`. A second conflict failure does not loop; an unrepairable hard-constraint conflict becomes `blocked`.

Private reports retain structured issues and warnings. The public plan stores only counts, passed check names, repaired issue codes, and evidence recency. The UI renders a human summary rather than raw issue JSON.
