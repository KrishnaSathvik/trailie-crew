import {
  segmentMentions,
  type MentionParticipant,
} from "@/features/chat/lib/mentions";

/**
 * Renders a message body with `@` mentions as chips.
 *
 * A Trailie chip here means "refers to Trailie", not "invoked Trailie" — that
 * distinction only exists live in the composer, since whether a sent message
 * invoked Trailie also depends on reply context that is not in the body.
 */
export function MentionText({
  body,
  participants = [],
  currentParticipantId = "",
  onAccent = false,
}: {
  body: string;
  participants?: MentionParticipant[];
  currentParticipantId?: string;
  /** Set inside an accent-filled bubble, where accent-on-accent would vanish. */
  onAccent?: boolean;
}) {
  const segments = segmentMentions(body, participants, currentParticipantId);

  return (
    <>
      {segments.map((segment, index) => {
        const key = `${segment.kind}-${index}`;

        if (segment.kind === "text")
          return <span key={key}>{segment.text}</span>;

        if (segment.kind === "trailie")
          return (
            <span
              key={key}
              className={`rounded-control mx-0.5 inline-block px-1.5 py-0.5 text-[0.8125rem] font-semibold ${
                onAccent
                  ? "bg-background/25 text-background"
                  : "bg-accent-soft text-accent"
              }`}
            >
              {segment.text}
            </span>
          );

        if (onAccent)
          return (
            <span
              key={key}
              className="bg-background/25 text-background rounded-control mx-0.5 px-1.5 py-0.5 font-semibold"
            >
              {segment.text}
            </span>
          );

        return (
          <span
            key={key}
            className={
              segment.isSelf
                ? "bg-accent-soft text-accent rounded-control mx-0.5 px-1.5 py-0.5 font-semibold"
                : "text-accent font-medium"
            }
          >
            {segment.text}
          </span>
        );
      })}
    </>
  );
}
