import "server-only";

type SafeAiLog = {
  invocationId?: string;
  runId?: string;
  model?: string;
  promptVersion?: string;
  status?: string;
  errorCode?: string;
  latencyMs?: number;
  retryCount?: number;
};

export function logAiEvent(event: string, metadata: SafeAiLog) {
  console.info(JSON.stringify({ scope: "trailie_ai", event, ...metadata }));
}
