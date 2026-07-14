type SafeContextMessage = {
  id: string;
  body: string;
  displayName: string;
  messageType: "user" | "trailie" | "system";
  createdAt: string;
  deletedAt: string | null;
};

export function assembleFocusedContext(
  input: readonly SafeContextMessage[],
  limits: {
    maxMessages: number;
    maxCharacters: number;
    requiredMessageIds?: readonly string[];
  },
) {
  const requiredIds = new Set(limits.requiredMessageIds ?? []);
  const eligible = input
    .filter(
      (message) =>
        message.deletedAt === null && message.messageType !== "system",
    )
    .sort((a, b) => {
      const requiredOrder =
        Number(requiredIds.has(b.id)) - Number(requiredIds.has(a.id));
      return requiredOrder || b.createdAt.localeCompare(a.createdAt);
    });
  const selected: SafeContextMessage[] = [];
  let characters = 0;
  for (const message of eligible) {
    const size = message.displayName.length + message.body.length + 8;
    if (
      selected.length >= limits.maxMessages ||
      (selected.length > 0 && characters + size > limits.maxCharacters)
    )
      break;
    selected.push(message);
    characters += size;
  }
  selected.reverse();
  const text = [
    "<UNTRUSTED CREW MESSAGES>",
    ...selected.map((message) => `${message.displayName}: ${message.body}`),
    "</UNTRUSTED CREW MESSAGES>",
  ].join("\n");
  return { messages: selected, text };
}
