import type {
  ApprovalMode,
  MessageType,
  ParticipantRole,
} from "@trailie/schemas";

type SafeMessage = {
  id: string;
  body: string;
  participantId: string;
  displayName: string;
  messageType: MessageType;
};

export type MemoryProviderContext = {
  sourceMessage: { id: string; body: string };
  sourceParticipant: {
    id: string;
    displayName: string;
    role: ParticipantRole;
  };
  approvalMode: ApprovalMode;
  replyTarget?: SafeMessage | null;
  recentMessages: SafeMessage[];
  activeFacts: Array<Record<string, unknown>>;
};

function bounded(value: string, limit: number) {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function block(name: string, value: unknown) {
  return `<${name}>${JSON.stringify(value)}</${name}>`;
}

export function buildMemoryContext(input: MemoryProviderContext) {
  const recent = input.recentMessages.slice(-6).map(
    (message) =>
      `<RECENT_MESSAGE>${JSON.stringify({
        id: message.id,
        body: bounded(message.body, 700),
        participantId: message.participantId,
        displayName: bounded(message.displayName, 50),
        messageType: message.messageType,
      })}</RECENT_MESSAGE>`,
  );
  const facts = input.activeFacts.slice(0, 12).map((fact) => ({
    id: fact.id,
    subjectType: fact.subjectType,
    subjectParticipantId: fact.subjectParticipantId,
    factType: fact.factType,
    canonicalKey: fact.canonicalKey,
    value: fact.value,
    status: fact.status,
  }));
  const result = [
    block("SOURCE_PARTICIPANT", input.sourceParticipant),
    block("ROOM_POLICY", { approvalMode: input.approvalMode }),
    block("SOURCE_MESSAGE", {
      id: input.sourceMessage.id,
      body: bounded(input.sourceMessage.body, 4000),
    }),
    input.replyTarget ? block("REPLY_TARGET", input.replyTarget) : "",
    ...recent,
    block("ACTIVE_FACTS", facts),
  ]
    .filter(Boolean)
    .join("\n");
  return bounded(result, 8_000);
}
