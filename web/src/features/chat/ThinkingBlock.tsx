import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { fetchThinking } from "@/api/agent";
import { scheduleIdle } from "@/state/schedule-idle";
import type { TranscriptClasses } from "./classes";
import { MarkdownBody } from "./MarkdownBody";

export interface ThinkingBlockProps {
  text: string;
  classes: TranscriptClasses;
  /** Saved history may omit large thinking blocks until requested. */
  deferred?: boolean;
  sessionId?: string | null;
  entryId?: string | null;
  blockIndex?: number;
  /** Shared with the committed message so the frozen seconds survive the live row unmounting. */
  timestamp?: number | null;
  /** Model-call duration in milliseconds, used when this block was not timed live. */
  duration?: number | null;
  streaming?: boolean;
}

interface ThinkingClock {
  start: number;
  end: number | null;
}

const clocks = new Map<string, ThinkingClock>();

let nextClock = 0;

function clockKey(
  sessionId: string | null,
  timestamp: number | null,
  entryId: string | null,
  blockIndex: number,
  localId: number,
): string {
  if (timestamp !== null) return `${sessionId ?? ""}:t${timestamp}:${blockIndex}`;
  if (entryId !== null) return `${sessionId ?? ""}:e${entryId}:${blockIndex}`;
  return `${sessionId ?? ""}:live:${localId}:${blockIndex}`;
}

function elapsedSeconds(clock: ThinkingClock, now = Date.now()): number {
  return Math.max(0, Math.floor(((clock.end ?? now) - clock.start) / 1000));
}

/** Start a clock while thinking is live, and freeze it on the first quiet read. */
function bindClock(key: string, previousKey: string | null, active: boolean, now = Date.now()): ThinkingClock | null {
  if (previousKey !== null && previousKey !== key) {
    const previous = clocks.get(previousKey);
    if (previous && !clocks.has(key)) {
      clocks.set(key, previous);
      clocks.delete(previousKey);
    }
  }
  if (active) {
    let clock = clocks.get(key);
    if (!clock) {
      clock = { start: now, end: null };
      clocks.set(key, clock);
    }
    return clock;
  }
  const clock = clocks.get(key);
  if (!clock) return null;
  if (clock.end === null) clock.end = now;
  return clock;
}

/**
 * Collapsible thinking content. Deferred blocks are fetched on first open via
 * `fetchThinking`; loading, error, and empty states stay inside the block.
 */
export function ThinkingBlock({
  text,
  classes,
  deferred = false,
  sessionId = null,
  entryId = null,
  blockIndex,
  timestamp = null,
  duration = null,
  streaming = false,
}: ThinkingBlockProps): JSX.Element {
  const [loaded, setLoaded] = useState<string | null>(null);
  const [parsed, setParsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    // A reused row (same index after navigation) must not keep another
    // message's loaded thinking or a stale in-flight request.
    cancelled.current = false;
    requested.current = false;
    setLoaded(null);
    setParsed(false);
    setError(null);
    setLoading(false);
    return () => {
      cancelled.current = true;
    };
  }, [sessionId, entryId, blockIndex]);

  const body = loaded ?? text;
  const forceOpen = streaming && !deferred;
  const localId = useRef(0);
  if (localId.current === 0) localId.current = ++nextClock;
  const key = clockKey(sessionId, timestamp, entryId, blockIndex ?? 0, localId.current);
  const previousKey = useRef<string | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const savedSeconds = typeof duration === "number" && Number.isFinite(duration) && duration > 0
    ? Math.max(1, Math.round(duration / 1000))
    : null;
  const shownSeconds = seconds ?? savedSeconds;

  useEffect(() => {
    const clock = bindClock(key, previousKey.current, streaming);
    previousKey.current = key;
    if (!clock) {
      setSeconds(null);
      return;
    }
    const tick = () => setSeconds(elapsedSeconds(clock));
    tick();
    if (!streaming) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [key, streaming]);
  useEffect(() => {
    if (deferred || streaming || body.trim() === "") return;
    return scheduleIdle(() => setParsed(true));
  }, [deferred, streaming, body]);
  const showMarkdown = streaming || deferred || parsed;

  const load = () => {
    if (!deferred || requested.current) return;
    requested.current = true;
    if (body.trim() !== "") return;
    if (sessionId === null || entryId === null || typeof blockIndex !== "number") {
      setError("Thinking is no longer available.");
      return;
    }
    setLoading(true);
    setError(null);
    fetchThinking(sessionId, entryId, blockIndex).then(
      (value) => {
        if (cancelled.current) return;
        setLoaded(value);
        setLoading(false);
      },
      (reason: unknown) => {
        if (cancelled.current) return;
        setError(reason instanceof Error ? reason.message : "Failed to load thinking.");
        setLoading(false);
      },
    );
  };

  return (
    <details className={classes.thinking} {...(forceOpen ? { open: true } : {})}>
      <summary
        className={classes.thinkingSummary}
        onClick={() => {
          load();
        }}
      >
        <span>Thinking</span>
        {shownSeconds !== null ? <span className={classes.thinkingLoading}>{shownSeconds}s</span> : null}
      </summary>
      <div className={classes.thinkingBody}>
        {loading ? <p className={classes.thinkingLoading}>Loading thinking…</p> : null}
        {error !== null ? <p className={classes.thinkingError}>{error}</p> : null}
        {!loading && error === null && body.trim() !== "" && showMarkdown ? (
          <MarkdownBody text={body} classes={classes} className={classes.thinkingMarkdown} />
        ) : null}
      </div>
    </details>
  );
}
