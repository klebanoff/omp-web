import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

/**
 * The bundled Nerd Font is what makes terminal glyphs render in the desktop
 * webview, where no system font can be assumed. A missing file or an unwired
 * token fails silently in a browser and is invisible in review, so the wiring
 * is asserted here.
 */

const here = dirname(fileURLToPath(import.meta.url));
const FACES = [
  "HackNerdFontMono-Regular.woff2",
  "HackNerdFontMono-Bold.woff2",
  "HackNerdFontMono-Italic.woff2",
  "HackNerdFontMono-BoldItalic.woff2",
];

test("every bundled face has an @font-face and a real file", () => {
  const css = readFileSync(join(here, "fonts.css"), "utf8");
  const referenced = [...css.matchAll(/url\("([^"]+\.woff2)"\)/g)].map((match) => (match[1] ?? "").split("/").pop());
  expect(referenced.sort()).toEqual([...FACES].sort());

  for (const face of FACES) {
    const file = join(here, "..", "assets", "fonts", face);
    expect(statSync(file).size, face).toBeGreaterThan(100_000);
  }
});

test("the mono token prefers the bundled family and the license ships with it", () => {
  const tokens = readFileSync(join(here, "tokens.css"), "utf8");
  const mono = /--font-mono:\s*([^;]+);/.exec(tokens);
  expect((mono?.[1] ?? "").trim().startsWith('"Hack Nerd Font Mono"')).toBe(true);

  const license = readFileSync(join(here, "..", "assets", "fonts", "LICENSE.md"), "utf8");
  expect(license).toContain("MIT License");
});
