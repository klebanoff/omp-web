import assert from "node:assert/strict";
import { test } from "bun:test";
import { collectRoutes, manifestRoutes } from "./index.ts";
import { routeModules } from "./routes-manifest.ts";

/**
 * The manifest is committed and generated (`bun run routes:manifest`); these
 * tests are what keeps it from drifting. A stale manifest does not fail the
 * server, it silently drops routes — so it must fail here and in CI.
 */

test("manifest covers exactly the route files on disk", () => {
  const fromDisk = collectRoutes()
    .map((route) => route.segments.join("/") + "/route.ts")
    .sort();
  const fromManifest = Object.keys(routeModules).sort();
  assert.deepEqual(fromManifest, fromDisk);
});

test("manifest routes keep their segments and load a module", async () => {
  const routes = manifestRoutes();
  assert.equal(routes.length, Object.keys(routeModules).length);

  const sessions = routes.find((route) => route.segments.join("/") === "agent/sessions");
  assert.ok(sessions, "agent/sessions route is missing from the manifest");

  const load = routeModules[sessions.file];
  assert.equal(typeof load, "function");
  const loaded = await load();
  assert.equal(typeof loaded.GET, "function");
});
