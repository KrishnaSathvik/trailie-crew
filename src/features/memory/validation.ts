import {
  memoryPatchSchema,
  type ApprovalMode,
  type ExtractedMemoryFact,
  type MemoryFactStatus,
  type MemoryFactType,
  type MemoryPatch,
  type MemorySubjectType,
} from "@trailie/schemas";

export type ActiveMemoryFact = {
  id: string;
  roomId: string;
  subjectType: MemorySubjectType;
  subjectParticipantId: string | null;
  factType: MemoryFactType;
  canonicalKey: string;
  value: Record<string, unknown>;
  status: MemoryFactStatus;
};

export type MemoryValidationContext = {
  roomId: string;
  sourceMessageId: string;
  sourceParticipantId: string;
  approvalMode: ApprovalMode;
  sourceBody?: string;
  sourceParticipantRole?: "host" | "member";
  participants: string[];
  activeFacts: ActiveMemoryFact[];
};

function fail(code: string): never {
  throw new Error(code);
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value;
}

function normalizeValue(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeText(item)]),
  );
}

function canonicalKey(fact: {
  subjectType: MemorySubjectType;
  factType: MemoryFactType;
}) {
  return `${fact.subjectType}:${fact.factType}`;
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateMemoryPatch(
  untrustedPatch: unknown,
  context: MemoryValidationContext,
): MemoryPatch {
  if (!untrustedPatch || typeof untrustedPatch !== "object")
    fail("invalid_memory_patch");
  const raw = untrustedPatch as { facts?: unknown; supersessions?: unknown };
  if (!Array.isArray(raw.facts) || raw.facts.length > 12)
    fail("invalid_memory_patch");
  const normalizedInput = {
    facts: raw.facts.map((item) => {
      if (!item || typeof item !== "object") return item;
      const fact = item as Record<string, unknown>;
      const confidence =
        typeof fact.confidence === "number"
          ? Math.min(1, Math.max(0, fact.confidence))
          : fact.confidence;
      return { ...fact, confidence };
    }),
    supersessions: Array.isArray(raw.supersessions) ? raw.supersessions : [],
  };
  const parsed = memoryPatchSchema.safeParse(normalizedInput);
  if (!parsed.success) fail("invalid_memory_patch");

  const activeById = new Map(
    context.activeFacts.map((fact) => [fact.id, fact]),
  );
  const validParticipants = new Set(context.participants);
  const accepted: ExtractedMemoryFact[] = [];

  for (const source of parsed.data.facts) {
    if (source.sourceMessageId !== context.sourceMessageId)
      fail("source_message_invalid");
    if (
      source.subjectType === "participant" &&
      (!source.subjectParticipantId ||
        !validParticipants.has(source.subjectParticipantId))
    )
      fail("participant_not_found");
    if (
      source.subjectType === "participant" &&
      source.subjectParticipantId !== context.sourceParticipantId
    )
      fail("supersession_not_allowed");
    if (source.factType === "group_decision") {
      const body = context.sourceBody ?? "";
      const consensus =
        /\b(?:we|everyone|everybody|the crew|the group)\b.{0,24}\b(?:all\s+)?(?:decided|agreed|confirmed|approved)\b/i.test(
          body,
        );
      const authorizedHostDecision =
        context.approvalMode === "host_only" &&
        context.sourceParticipantRole === "host" &&
        /\bi\b.{0,16}\b(?:decided|confirm(?:ed)?|approve(?:d)?)\b/i.test(body);
      if (
        source.evidenceStrength !== "explicit" ||
        (!consensus && !authorizedHostDecision)
      )
        fail("invalid_memory_patch");
    }

    const value = normalizeValue(source.value);
    const key = canonicalKey(source);
    if (source.supersedesFactId) {
      const prior = activeById.get(source.supersedesFactId);
      if (!prior || prior.roomId !== context.roomId)
        fail("supersession_not_allowed");
      if (
        prior.subjectType !== "participant" ||
        source.subjectType !== "participant" ||
        prior.subjectParticipantId !== context.sourceParticipantId ||
        source.subjectParticipantId !== context.sourceParticipantId ||
        prior.factType !== source.factType ||
        prior.canonicalKey !== key ||
        prior.factType === "group_decision"
      )
        fail("supersession_not_allowed");
    }
    const duplicate = context.activeFacts.some(
      (prior) =>
        prior.roomId === context.roomId &&
        prior.subjectType === source.subjectType &&
        prior.subjectParticipantId === (source.subjectParticipantId ?? null) &&
        prior.factType === source.factType &&
        prior.canonicalKey === key &&
        prior.status === source.status &&
        sameValue(prior.value, value),
    );
    if (!duplicate) accepted.push({ ...source, canonicalKey: key, value });
  }

  return { facts: accepted, supersessions: parsed.data.supersessions };
}
