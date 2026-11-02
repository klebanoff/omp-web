#!/usr/bin/env bun
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/**
 * Stages the native modules the desktop bundle must carry.
 *
 * `electrobun.config.ts` marks `node-pty` and `sharp` as `external` so the
 * bundler leaves `import("node-pty")` / `import("sharp")` alone; the packages
 * themselves are copied next to the bundle and resolved at runtime the way a
 * normal `node_modules` would be. Bun installs them into an isolated `.bun`
 * store with symlinks and per-package dependency trees, which a plain directory
 * copy does not preserve — so this walks the real package directories and
 * flattens them into one hoisted `node_modules`.
 */

const ROOT = join(import.meta.dir, "..");
const STAGE = join(ROOT, ".tmp", "desktop-native", "node_modules");
const ROOTS = ["node-pty", "sharp"];

/** Directories no runtime import needs; dropping them keeps the app small. */
const PRUNE = [
  "node_modules",
  "src",
  "test",
  "tests",
  "__tests__",
  "docs",
  "obj",
  "binding.gyp",
  "third_party",
  "deps",
  "scripts",
  "bench",
];

interface Manifest {
  name: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

function readManifest(dir: string): Manifest | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const manifest = parsed as Manifest;
    return typeof manifest.name === "string" ? manifest : null;
  } catch {
    return null;
  }
}

/** Real directory of an installed package, following bun's symlinks. */
export function packageDir(spec: string, fromDir: string): string | null {
  const from = join(fromDir, "__resolve__.js");
  try {
    return dirname(Bun.resolveSync(`${spec}/package.json`, from));
  } catch {
    // Packages that do not export ./package.json: resolve the entry and walk up.
  }
  try {
    let dir = dirname(Bun.resolveSync(spec, from));
    while (true) {
      const manifest = readManifest(dir);
      if (manifest?.name === spec) return dir;
      const parent = dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  } catch {
    return null;
  }
}

/** `prebuilds/` holds every platform; only one can load on this host. */
function prunePrebuilds(dest: string): void {
  const dir = join(dest, "prebuilds");
  if (!existsSync(dir)) return;
  const keep = `${process.platform}-${process.arch}`;
  for (const entry of readdirSync(dir)) {
    if (entry !== keep) rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

/** Debug symbols ship with the vendored binaries and nothing loads them. */
function pruneSymbols(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) pruneSymbols(full);
    else if (entry.name.endsWith(".pdb")) rmSync(full, { force: true });
  }
}

function sizeOf(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += sizeOf(full);
    else if (entry.isFile()) total += statSync(full).size;
  }
  return total;
}

/** Copies the roots plus every dependency they resolve, flattened. */
export function stageNativeModules(outDir = STAGE): { packages: string[]; bytes: number } {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const packages: string[] = [];
  const queue = ROOTS.map((spec) => ({ spec, from: ROOT, optional: false }));
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const dir = packageDir(item.spec, item.from);
    if (!dir) {
      if (item.optional) continue;
      throw new Error(`Cannot resolve ${item.spec} from ${relative(ROOT, item.from)}`);
    }
    if (packages.includes(item.spec)) continue;

    const dest = join(outDir, item.spec);
    cpSync(dir, dest, { recursive: true, dereference: true });
    for (const name of PRUNE) rmSync(join(dest, name), { recursive: true, force: true });
    prunePrebuilds(dest);
    pruneSymbols(dest);
    packages.push(item.spec);

    const manifest = readManifest(dir);
    const dependencies = manifest?.dependencies ?? {};
    const optional = manifest?.optionalDependencies ?? {};
    for (const name of Object.keys(dependencies)) {
      if (!packages.includes(name)) queue.push({ spec: name, from: dir, optional: false });
    }
    for (const name of Object.keys(optional)) {
      if (!packages.includes(name)) queue.push({ spec: name, from: dir, optional: true });
    }
  }

  return { packages, bytes: sizeOf(outDir) };
}

if (import.meta.main) {
  const { packages, bytes } = stageNativeModules();
  console.log(
    `staged ${packages.length} native packages (${packages.join(", ")}) into ${relative(ROOT, STAGE)} (${(bytes / 1024 / 1024).toFixed(1)} MB)`,
  );
}
