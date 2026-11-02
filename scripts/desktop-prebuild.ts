#!/usr/bin/env bun
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { stageNativeModules } from "./desktop-stage-native.ts";

/**
 * Electrobun `preBuild` hook: make the two copy sources `electrobun.config.ts`
 * ships exist and be current.
 *
 * The SPA is rebuilt when `web/dist` is missing or older than its sources, so a
 * desktop build never packs a UI from a previous edit. The native packages are
 * staged fresh every build for the same reason: they come from `node_modules`,
 * which `bun install` rewrites.
 */

const root = join(import.meta.dir, "..");
const index = join(root, "web", "dist", "index.html");

/** Newest modification time under a path; subdirectories that never hold sources are skipped. */
function newestMtime(path: string): number {
  const stats = statSync(path);
  if (stats.isFile()) return stats.mtimeMs;
  let newest = stats.mtimeMs;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "test-results") continue;
    newest = Math.max(newest, newestMtime(join(path, entry.name)));
  }
  return newest;
}

function stale(): boolean {
  if (!existsSync(index)) return true;
  const built = statSync(index).mtimeMs;
  const sources = [join(root, "web", "src"), join(root, "web", "index.html"), join(root, "web", "vite.config.ts")];
  return sources.some((source) => existsSync(source) && newestMtime(source) > built);
}

if (stale()) {
  console.log("prebuild: building the web console (web/dist is missing or stale)");
  const build = Bun.spawnSync({
    cmd: [process.execPath, "run", "web:build"],
    cwd: root,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (build.exitCode !== 0) {
    console.error("prebuild: web:build failed");
    process.exit(build.exitCode ?? 1);
  }
} else {
  console.log("prebuild: web/dist is up to date");
}

const { packages, bytes } = stageNativeModules();
console.log(`prebuild: staged ${packages.join(", ")} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
