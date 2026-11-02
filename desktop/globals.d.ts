/**
 * The Electrobun SDK sources reference the worker-scoped `self` global, which
 * the Bun type definitions do not declare. Typecheck-only shim: the main
 * process runs under Bun, where this code path is guarded by `typeof self`.
 */
declare var self: typeof globalThis & {
  postMessage(message: unknown): void;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
};
