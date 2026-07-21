export async function withCancellationPolling<T>(input: {
  intervalMs: number;
  isCancelled(): Promise<boolean>;
  run(signal: AbortSignal): Promise<T>;
}) {
  const controller = new AbortController();
  let checking = false;
  const timer = setInterval(() => {
    if (checking || controller.signal.aborted) return;
    checking = true;
    void input
      .isCancelled()
      .then((cancelled) => {
        if (cancelled && !controller.signal.aborted)
          controller.abort(
            new DOMException("The request was stopped.", "AbortError"),
          );
      })
      .finally(() => {
        checking = false;
      });
  }, input.intervalMs);
  timer.unref?.();
  try {
    return await input.run(controller.signal);
  } finally {
    clearInterval(timer);
  }
}
