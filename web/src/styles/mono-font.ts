/**
 * The bundled mono stack, read once from the CSS token so canvas-rendered text
 * (xterm.js, Monaco) uses the same font as the rest of the console.
 *
 * Both measure glyphs themselves: with the system fallback they would size cells
 * against a font the page never uses, so they must be given the resolved stack and
 * re-measured after the web font arrives (see `fontsReady`).
 */
export const MONO_FALLBACK = "ui-monospace, SFMono-Regular, \"Cascadia Code\", \"Segoe UI Mono\", Menlo, Consolas, \"Liberation Mono\", monospace";

export function monoFontFamily(node?: HTMLElement | null): string {
  const target = node ?? (typeof document === "undefined" ? null : document.documentElement);
  if (!target) return MONO_FALLBACK;
  const value = getComputedStyle(target).getPropertyValue("--font-mono").trim();
  return value.length > 0 ? value : MONO_FALLBACK;
}

/** Resolves once every `@font-face` in use is loaded (immediately without a DOM). */
export function fontsReady(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  return document.fonts.ready.then(() => undefined);
}
