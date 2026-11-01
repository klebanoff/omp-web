import { useEffect, useRef, useState, type JSX, type ReactNode, type RefObject } from "react";
import type { ChatMessage } from "@/api/session-types";
import { scheduleIdle } from "@/state/schedule-idle";
import type { TranscriptClasses } from "./classes";
import { messagePreview, roleLabel } from "./transcript";

export interface DeferredMessageProps {
  message: ChatMessage;
  classes: TranscriptClasses;
  /** Tail, held, and the live stream stay fully rendered. */
  eager: boolean;
  scrollRoot: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/**
 * Off-screen history is a one-line shell until it nears the transcript
 * viewport. Once revealed, the full body stays mounted.
 */
export function DeferredMessage({
  message,
  classes,
  eager,
  scrollRoot,
  children,
}: DeferredMessageProps): JSX.Element {
  const [shown, setShown] = useState(eager);
  const ref = useRef<HTMLElement>(null);
  const visible = eager || shown;

  useEffect(() => {
    if (eager || shown) return;
    return scheduleIdle(() => setShown(true));
  }, [eager, shown]);

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    const root = scrollRoot.current;
    if (!node || !root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setShown(true);
      },
      { root, rootMargin: "240px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [scrollRoot, visible]);

  if (visible) return <>{children}</>;

  const role = typeof message.role === "string" ? message.role : "";
  const preview = messagePreview(message);
  return (
    <article ref={ref} className={classes.message} data-role={role} data-deferred="true">
      <span className={classes.role}>{roleLabel(role)}</span>
      {preview !== "" ? <p className={classes.deferredPreview}>{preview}</p> : null}
    </article>
  );
}
