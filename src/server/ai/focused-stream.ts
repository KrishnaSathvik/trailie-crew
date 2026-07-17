import type {
  FocusedAnswerProviderResult,
  FocusedAnswerProviderStream,
} from "@/server/ai/provider";

export async function consumeFocusedStream(
  stream: FocusedAnswerProviderStream,
): Promise<{
  bufferedDeltas: string[];
  result: FocusedAnswerProviderResult;
}> {
  const completion = stream.completed.then(
    (result) => ({ status: "fulfilled" as const, result }),
    (error: unknown) => ({ status: "rejected" as const, error }),
  );
  const bufferedDeltas: string[] = [];
  try {
    for await (const delta of stream.textDeltas) bufferedDeltas.push(delta);
  } catch (streamError) {
    const completed = await completion;
    if (completed.status === "rejected") throw completed.error;
    throw streamError;
  }
  const completed = await completion;
  if (completed.status === "rejected") throw completed.error;
  return { bufferedDeltas, result: completed.result };
}
