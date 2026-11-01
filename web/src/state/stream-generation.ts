import { useSyncExternalStore } from "react";

/** Bumped when a command bootstraps a live omp wrapper, so the chat resubscribes. */

let generation = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function bumpStreamGeneration(): void {
  generation += 1;
  emit();
}

export function useStreamGeneration(): number {
  return useSyncExternalStore(subscribe, () => generation, () => 0);
}
