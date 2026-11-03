import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "bun:test";

// Point omp's data dir at a throwaway tree BEFORE any session scan runs, so the
// routes resolve this fixture instead of the developer's real sessions.
const agentDir = mkdtempSync(join(tmpdir(), "omp-subagent-routes-"));
const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

const { collectRoutes, dispatch } = await import("./index.ts");
const { invalidateSessionListCache } = await import("../lib/session-reader.ts");

const routes = collectRoutes();

/**
 * The override is process-global, so it is installed only for the duration of
 * one test body and removed again: leaving it behind (or the session list
 * cache warm on a deleted directory) would poison every later test file.
 */
function withFixture(run) {
  process.env.PI_CODING_AGENT_DIR = agentDir;
  invalidateSessionListCache();
  writeSessionFixture();
  return run().finally(() => {
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    invalidateSessionListCache();
    rmSync(agentDir, { recursive: true, force: true });
  });
}

const PROJECT_DIR = "--work--";
const SESSION_ID = "01a4c0ffee1234";
const SESSION_NAME = `2026-08-01T00-00-00.000Z_${SESSION_ID}`;
const SESSIONS_ROOT = join(agentDir, "sessions", PROJECT_DIR);
const sessionFile = join(SESSIONS_ROOT, `${SESSION_NAME}.jsonl`);
const artifactsDir = join(SESSIONS_ROOT, SESSION_NAME);

/** One parent session whose `task` toolResult recorded a finished subagent. */
function writeSessionFixture() {
  mkdirSync(SESSIONS_ROOT, { recursive: true });
  mkdirSync(artifactsDir, { recursive: true });
  writeFileSync(sessionFile, [
    JSON.stringify({ type: "session", version: 3, id: SESSION_ID, timestamp: "2026-08-01T00:00:00.000Z", cwd: "/work" }),
    JSON.stringify({
      type: "message",
      id: "e1",
      parentId: null,
      timestamp: "2026-08-01T00:00:01.000Z",
      message: {
        role: "toolResult",
        toolCallId: "tc1",
        toolName: "task",
        content: [],
        details: {
          progress: [{
            index: 0,
            id: "Scout",
            agent: "scout",
            status: "completed",
            task: "Map the surface",
            tokens: 1200,
            cost: 0.012,
            durationMs: 65000,
            resolvedModel: "provider/gpt-x:high",
          }],
          results: [{ index: 0, id: "Scout", agent: "scout", exitCode: 0, tokens: 999 }],
        },
      },
    }),
  ].join("\n") + "\n");

  writeFileSync(join(artifactsDir, "Scout.jsonl"), [
    JSON.stringify({
      type: "message",
      id: "s1",
      parentId: null,
      timestamp: "2026-08-01T00:00:02.000Z",
      message: { role: "user", content: "Map the surface" },
    }),
    JSON.stringify({
      type: "message",
      id: "s2",
      parentId: "s1",
      timestamp: "2026-08-01T00:00:03.000Z",
      message: { role: "assistant", content: "Found the surface." },
    }),
  ].join("\n") + "\n");
  writeFileSync(join(artifactsDir, "Scout.md"), "Found the surface.\n");
}

function request(path) {
  return new Request(`http://127.0.0.1:30178${path}`, { method: "GET" });
}

async function get(path) {
  invalidateSessionListCache();
  const response = await dispatch(request(path), routes);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test("roster route returns the typed on-disk subagent list", () => withFixture(async () => {
    const { status, body } = await get(`/api/agent/sessions/${SESSION_ID}/subagents`);
    assert.equal(status, 200);
    assert.equal(body.subagents.length, 1);
    const [entry] = body.subagents;
    assert.equal(entry.id, "Scout");
    assert.equal(entry.agent, "scout");
    assert.equal(entry.status, "completed");
    assert.equal(entry.transcriptAvailable, true);
    // The settled result wins over the earlier progress snapshot.
    assert.equal(entry.tokens, 999);
}));

test("roster route 404s for an unknown session", () => withFixture(async () => {
    const { status, body } = await get("/api/agent/sessions/does-not-exist/subagents");
    assert.equal(status, 404);
    assert.equal(body.code, "session_not_found");
}));

test("transcript route pages, tails and rejects a malformed subagent id", () => withFixture(async () => {
    const first = await get(`/api/agent/sessions/${SESSION_ID}/subagents/Scout`);
    assert.equal(first.status, 200);
    assert.equal(first.body.messages.length, 2);
    assert.equal(first.body.messages[0].role, "user");

    const tail = await get(`/api/agent/sessions/${SESSION_ID}/subagents/Scout?mode=tail`);
    assert.equal(tail.status, 200);
    // Short transcript: the tail is the first page.
    assert.equal(tail.body.fromByte, 0);
    assert.deepEqual(tail.body.messages, first.body.messages);

    const invalid = await get(`/api/agent/sessions/${SESSION_ID}/subagents/${encodeURIComponent("../Scout")}`);
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, "invalid_subagent_id");

    const missing = await get(`/api/agent/sessions/${SESSION_ID}/subagents/Ghost`);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, "transcript_not_found");
}));

test("completion route returns the final artifact and 404s without one", () => withFixture(async () => {
    const ok = await get(`/api/agent/sessions/${SESSION_ID}/subagents/Scout?mode=completion`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.completion, "Found the surface.\n");
    assert.equal(ok.body.truncated, false);

    const missing = await get(`/api/agent/sessions/${SESSION_ID}/subagents/Ghost?mode=completion`);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, "transcript_not_found");
    assert.equal(existsSync(join(artifactsDir, "Ghost.md")), false);
}));
