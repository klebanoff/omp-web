import { useLayoutEffect, useRef, type RefObject, type UIEvent } from "react";

/**
 * Transcript scroll behavior: keep the live tail pinned while the reader is at
 * the bottom, and preserve the reading position when an older page is
 * prepended. No CSS here; a skin only supplies the scroll element.
 */

/** Distance from the bottom that still counts as "following the tail". */
export const STICK_SLACK_PX = 80;
/** Distance from the top that asks for an older history page. */
export const OLDER_TRIGGER_PX = 80;

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export function distanceFromBottom(metrics: ScrollMetrics): number {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
}

export function isNearBottom(metrics: ScrollMetrics, slack = STICK_SLACK_PX): boolean {
  return distanceFromBottom(metrics) < slack;
}

/** An older page may load only when the reader is at the top and none is pending. */
export function shouldLoadOlder(
  metrics: ScrollMetrics,
  hasOlderHistory: boolean,
  anchorPending: boolean,
  trigger = OLDER_TRIGGER_PX,
): boolean {
  return metrics.scrollTop < trigger && hasOlderHistory && !anchorPending;
}

/**
 * New `scrollTop` after a prepend: keep the element that was at the top of the
 * viewport at the top of the viewport.
 */
export function anchorRestoredScrollTop(
  metrics: ScrollMetrics,
  previousScrollHeight: number,
): number {
  return metrics.scrollTop + (metrics.scrollHeight - previousScrollHeight);
}

export interface TranscriptScrollOptions {
  hasOlderHistory: boolean;
  onLoadOlderHistory: () => void;
  /** Values whose layout change must keep the transcript pinned to the tail. */
  dependencies: readonly unknown[];
}

export interface TranscriptScrollBinding {
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
}

export function useTranscriptScroll({
  hasOlderHistory,
  onLoadOlderHistory,
  dependencies,
}: TranscriptScrollOptions): TranscriptScrollBinding {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const olderAnchor = useRef<number | null>(null);

  // Scroll before deferred rows observe the viewport, so the first paint's
  // top of the transcript is not treated as visible.
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const previousHeight = olderAnchor.current;
    if (previousHeight !== null) {
      node.scrollTop = anchorRestoredScrollTop(node, previousHeight);
      olderAnchor.current = null;
      stick.current = false;
      return;
    }
    if (stick.current) node.scrollTop = node.scrollHeight;
  }, dependencies);

  const onScroll = (event: UIEvent<HTMLDivElement>): void => {
    const node = event.currentTarget;
    stick.current = isNearBottom(node);
    if (shouldLoadOlder(node, hasOlderHistory, olderAnchor.current !== null)) {
      olderAnchor.current = node.scrollHeight;
      onLoadOlderHistory();
    }
  };

  return { scrollRef, onScroll };
}
