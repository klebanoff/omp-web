/** Runs `task` after the first frame, when the browser is idle. */
export function scheduleIdle(task: () => void, timeout = 500): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(() => task(), { timeout });
    return () => cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, 1);
  return () => window.clearTimeout(id);
}
