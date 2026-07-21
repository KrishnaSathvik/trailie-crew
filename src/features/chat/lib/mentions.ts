export type MentionParticipant = { id: string; displayName: string };

export type MentionSegment =
  | { kind: "text"; text: string }
  | { kind: "person"; text: string; participantId: string; isSelf: boolean }
  | { kind: "trailie"; text: string };

export const TRAILIE_MENTION_NAME = "Trailie";

/**
 * Trailie is listed first so it wins a length tie against a participant who
 * happens to be named "Trailie" — the system identity takes precedence. Sort is
 * stable, so the remaining order follows the participant list.
 *
 * Longest first is what lets "Sam Smith" win over "Sam".
 */
export function buildMentionCandidates(participants: MentionParticipant[]) {
  return [
    {
      name: TRAILIE_MENTION_NAME,
      lower: TRAILIE_MENTION_NAME.toLowerCase(),
      participantId: null as string | null,
    },
    ...participants.map((participant) => ({
      name: participant.displayName,
      lower: participant.displayName.toLowerCase(),
      participantId: participant.id as string | null,
    })),
  ].sort((a, b) => b.lower.length - a.lower.length);
}

function endsAtBoundary(body: string, index: number) {
  return index === body.length || /[\s.,!?;:]/.test(body[index]);
}

/**
 * Splits a message body into plain text and mention segments.
 *
 * Names are compared with `toLowerCase()` substring equality rather than a
 * regex built from the name: display names are user input, and a regex would
 * need escaping to stay safe.
 */
export function segmentMentions(
  body: string,
  participants: MentionParticipant[],
  currentParticipantId: string,
): MentionSegment[] {
  const candidates = buildMentionCandidates(participants);
  const lower = body.toLowerCase();
  const segments: MentionSegment[] = [];
  let textStart = 0;
  let index = 0;

  while (index < body.length) {
    // An "@" only opens a mention at the start of the body or after
    // whitespace, which is what keeps "sam@example.com" intact.
    if (body[index] !== "@" || (index > 0 && !/\s/.test(body[index - 1]))) {
      index += 1;
      continue;
    }

    const match = candidates.find(
      (candidate) =>
        lower.startsWith(candidate.lower, index + 1) &&
        endsAtBoundary(body, index + 1 + candidate.lower.length),
    );
    if (!match) {
      index += 1;
      continue;
    }

    if (index > textStart)
      segments.push({ kind: "text", text: body.slice(textStart, index) });
    segments.push(
      match.participantId === null
        ? { kind: "trailie", text: `@${match.name}` }
        : {
            kind: "person",
            text: `@${match.name}`,
            participantId: match.participantId,
            isSelf: match.participantId === currentParticipantId,
          },
    );
    index += 1 + match.lower.length;
    textStart = index;
  }

  if (textStart < body.length)
    segments.push({ kind: "text", text: body.slice(textStart) });
  return segments;
}
