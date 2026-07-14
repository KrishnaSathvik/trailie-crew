# Public Itinerary Privacy

## Deterministic projection

Public data is a separate strict schema, not a filtered private UI object and not a model judgment. Both PostgreSQL snapshot creation and application export projection use deterministic allowlists. Unknown fields fail parsing. HTML/control characters, email-shaped values, unsafe identity statements, and URLs are rejected or omitted.

Allowed fields are title, destination summary, dates/timezone/version, published timestamp, public day/activity text, generalized locations, route duration/mode, lodging area/recommendation, food suggestion, reservation requirement, safe warnings, verified/estimated/unknown status, a validation-passed badge, and the no-booking disclaimer.

## Always excluded

- participant/user IDs, email, member list, and private display names
- traveler origins, addresses, raw coordinates, and identifying accessibility/dietary statements
- chat, room memory, approvals, revisions, review notes, rejected alternatives, and private conflicts
- confirmation numbers, private budget/cost ceilings, and unsupported booking claims
- raw validation issues, repair traces, evidence, provider request IDs, model/prompt IDs, token usage, and safety IDs
- internal database IDs, raw/signed URLs, tokens, credentials, and operational artifact paths

Named constraints are removed. Generic itinerary-level wording may remain: “Maya has a mobility constraint” is excluded, while “This itinerary uses accessible pacing” is public-safe; “Alex is vegetarian” is excluded, while “Dietary-friendly options are included” is allowed. Exact traveler origins and confirmation details are never generalized into public output.

## Injection and leakage review

The strict schema rejects arbitrary HTML and all unknown operational/private properties. The React page renders text, not injected markup. Locations omit addresses/coordinates and exports omit arbitrary URLs, avoiding SSRF and malicious link propagation. ICS performs RFC escaping and octet folding; token/hash values never enter calendar or print content.

The anonymous route exposes no private navigation, room link, crew controls, editable inputs, provider calls, database-admin API, or browser credential. Invalid-token categories collapse into one generic state so the page cannot enumerate revoked, expired, malformed, or nonexistent links.
