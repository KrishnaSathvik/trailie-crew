import {
  trailieStreamEventSchema,
  type MessageType,
  type TrailieStreamEvent,
} from "@trailie/schemas";

export async function* invokeTrailieStream(input: {
  roomId: string;
  participantId: string;
  sourceMessageId: string;
  signal: AbortSignal;
}): AsyncGenerator<TrailieStreamEvent> {
  const response = await fetch("/api/trailie/invoke", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      roomId: input.roomId,
      participantId: input.participantId,
      sourceMessageId: input.sourceMessageId,
    }),
    signal: input.signal,
  });
  if (!response.ok || !response.body) throw new Error("trailie_request_failed");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      yield trailieStreamEventSchema.parse(JSON.parse(line));
    }
    if (done) break;
  }
  if (buffer.trim()) yield trailieStreamEventSchema.parse(JSON.parse(buffer));
}

export type TrailieInvocationSource = {
  id: string;
  body: string;
  replyTargetType: MessageType | null;
};
