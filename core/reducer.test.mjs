import assert from "node:assert/strict";
import { test } from "bun:test";

const { reduce } = await import("./reducer.ts");
const { initialState, visibleMessages } = await import("./state.ts");

const frame = (type, extra = {}, sequence = undefined, streamId = undefined) => ({
  type,
  ...extra,
  ...(sequence === undefined ? {} : { web: { streamId: streamId ?? "s1", sequence } }),
});

function run(state, actions) {
  return actions.reduce((current, action) => reduce(current, action), state);
}

function streamingState() {
  return run(initialState("sess-1"), [
    { type: "connection", status: "open", streamId: "s1" },
    { type: "frame", at: 1000, frame: frame("agent_start", {}, 1) },
  ]);
}

test("a frame the stream already moved past is ignored", () => {
  const state = run(streamingState(), [
    { type: "frame", at: 1001, frame: frame("message_update", { message: { role: "assistant", content: [{ type: "text", text: "hello" }] } }, 5) },
  ]);
  assert.equal(state.sequence, 5);

  const stale = reduce(state, {
    type: "frame",
    at: 1002,
    frame: frame("message_update", { message: { role: "assistant", content: [{ type: "text", text: "stale" }] } }, 4),
  });
  assert.equal(stale, state, "stale frame must not change state");
  assert.equal(stale.stream.message.content[0].text, "hello");
});

test("a new stream identity resets sequencing and asks for a history re-read", () => {
  const state = run(streamingState(), [
    { type: "frame", at: 1001, frame: frame("message_update", { message: { role: "assistant", content: [{ type: "text", text: "partial" }] } }, 7) },
  ]);
  const before = state.historyRevision;

  const next = reduce(state, {
    type: "frame",
    at: 1002,
    frame: frame("connected", {}, 1, "s2"),
  });
  assert.equal(next.streamId, "s2");
  assert.equal(next.sequence, 1);
  assert.equal(next.stream.active, false);
  assert.equal(next.stream.message, null);
  assert.ok(next.historyRevision > before);
});

test("agent_start starts a fresh run and clears live tool state", () => {
  const state = streamingState();
  assert.equal(state.run.status, "running");
  assert.equal(state.run.id, 1);
  assert.equal(state.stream.active, true);
  assert.deepEqual(state.toolResults, {});
});

test("message_end holds a finished reply until history contains it", () => {
  const state = run(streamingState(), [
    { type: "frame", at: 1001, frame: frame("message_update", { message: { role: "assistant", content: [{ type: "text", text: "answer" }], timestamp: 42 } }, 2) },
    { type: "frame", at: 1002, frame: frame("message_end", { message: { role: "assistant", content: [{ type: "text", text: "answer" }], timestamp: 42 } }, 3) },
  ]);
  assert.equal(state.stream.active, false);
  assert.equal(state.stream.message, null);
  assert.equal(state.stream.held.length, 1);
  assert.equal(state.stream.held[0].content[0].text, "answer");

  const withoutEcho = reduce(state, { type: "history", messages: [{ role: "user", content: "hi" }], entryIds: ["e1"] });
  assert.equal(withoutEcho.stream.held.length, 1, "an unrelated history must not drop the reply");

  const withEcho = reduce(state, {
    type: "history",
    messages: [{ role: "assistant", content: [{ type: "text", text: "answer" }], timestamp: 42 }],
    entryIds: ["e2"],
  });
  assert.deepEqual(withEcho.stream, { active: false, message: null, held: [] });
});

test("a later assistant step keeps earlier finished replies", () => {
  const first = { role: "assistant", content: [{ type: "text", text: "looking" }], timestamp: 1 };
  const second = { role: "assistant", content: [{ type: "text", text: "done" }], timestamp: 2 };
  const state = run(streamingState(), [
    { type: "frame", at: 1001, frame: frame("message_end", { message: first }, 2) },
    { type: "frame", at: 1002, frame: frame("message_start", {}, 3) },
    { type: "frame", at: 1003, frame: frame("message_update", { message: second }, 4) },
    { type: "frame", at: 1004, frame: frame("message_end", { message: second }, 5) },
  ]);
  assert.deepEqual(state.stream.held.map((message) => message.content[0].text), ["looking", "done"]);

  const partial = reduce(state, { type: "history", messages: [first], entryIds: ["e1"] });
  assert.deepEqual(partial.stream.held.map((message) => message.timestamp), [2]);
});

test("a tool-only assistant step stays held", () => {
  const state = run(streamingState(), [
    {
      type: "frame",
      at: 1001,
      frame: frame("message_end", {
        message: { role: "assistant", content: [{ type: "toolCall", toolCallId: "call-1", toolName: "bash", input: {} }], timestamp: 7 },
      }, 2),
    },
  ]);
  assert.equal(state.stream.held.length, 1);
  assert.equal(state.stream.held[0].content[0].toolName, "bash");
});

test("a held reply without a timestamp releases on the next history read", () => {
  const state = run(streamingState(), [
    { type: "frame", at: 1001, frame: frame("message_end", { message: { role: "assistant", content: [{ type: "text", text: "answer" }] } }, 2) },
  ]);
  assert.equal(state.stream.held.length, 1);
  const released = reduce(state, { type: "history", messages: [], entryIds: [] });
  assert.deepEqual(released.stream.held, []);
});

test("an empty assistant message is not held", () => {
  const state = run(streamingState(), [
    { type: "frame", at: 1001, frame: frame("message_end", { message: { role: "assistant", content: [{ type: "text", text: "   " }] } }, 2) },
  ]);
  assert.deepEqual(state.stream, { active: false, message: null, held: [] });
});

test("the optimistic prompt lives until history echoes it", () => {
  const state = reduce(initialState("sess-1"), {
    type: "prompt",
    message: { role: "user", content: "fix the build", timestamp: 10 },
  });
  assert.equal(visibleMessages(state).length, 1);

  const unrelated = reduce(state, { type: "history", messages: [{ role: "user", content: "something else" }], entryIds: ["e1"] });
  assert.equal(unrelated.optimistic?.content, "fix the build", "unrelated history keeps the pending prompt");

  const echoed = reduce(state, { type: "history", messages: [{ role: "user", content: "fix the build" }], entryIds: ["e2"] });
  assert.equal(echoed.optimistic, null);
  assert.equal(visibleMessages(echoed).length, 1);
});

test("a rejected prompt is withdrawn with an error notice", () => {
  const state = run(initialState("sess-1"), [
    { type: "prompt", message: { role: "user", content: "nope", timestamp: 10 } },
    { type: "prompt-settled", accepted: false, reason: "runtime busy", at: 11 },
  ]);
  assert.equal(state.optimistic, null);
  assert.equal(state.lastError, "runtime busy");
  assert.equal(state.notices.at(-1).message, "runtime busy");
  assert.equal(state.notices.at(-1).type, "error");
});

test("a non-terminal agent_end keeps the run alive", () => {
  const state = run(streamingState(), [
    { type: "frame", at: 1001, frame: frame("agent_end", { isTerminal: false }, 2) },
  ]);
  assert.equal(state.run.status, "running");
});

test("a silent terminal run asks for a history re-read instead of asserting an empty turn", () => {
  const state = run(streamingState(), [
    { type: "frame", at: 1001, frame: frame("agent_end", {}, 2) },
  ]);
  assert.equal(state.run.status, "idle");
  assert.equal(state.run.hadContent, false);
  assert.ok(state.historyRevision >= 2, "history must be re-read");
});

test("a terminal run with visible output re-reads the committed history", () => {
  const before = streamingState().historyRevision;
  const state = run(streamingState(), [
    { type: "frame", at: 1001, frame: frame("message_update", { message: { role: "assistant", content: [{ type: "text", text: "done" }] } }, 2) },
    { type: "frame", at: 1002, frame: frame("agent_end", {}, 3) },
  ]);
  assert.equal(state.run.status, "idle");
  assert.equal(state.run.hadContent, true);
  assert.equal(state.notices.length, 0);
  assert.ok(state.historyRevision > before, "the transcript must come from the session file after live output is cleared");
});

test("a terminal error surfaces as a notice and as run state", () => {
  const state = run(streamingState(), [
    { type: "frame", at: 1001, frame: frame("agent_end", { message: { role: "assistant", content: [], errorMessage: "quota exhausted" } }, 2) },
  ]);
  assert.equal(state.run.error, "quota exhausted");
  assert.equal(state.lastError, "quota exhausted");
  assert.equal(state.notices.at(-1).message, "quota exhausted");
});

test("queue snapshots replace the queue and bump its revision", () => {
  const state = run(initialState("sess-1"), [
    { type: "connection", status: "open", streamId: "s1" },
    { type: "frame", at: 1000, frame: frame("queue_update", { queuedMessages: { steering: ["a"], followUp: ["b", "c"] } }, 1) },
  ]);
  assert.deepEqual(state.queue.steering, ["a"]);
  assert.deepEqual(state.queue.followUp, ["b", "c"]);
  assert.equal(state.queue.revision, 1);

  const bad = reduce(state, { type: "frame", at: 1001, frame: frame("queue_update", { queuedMessages: { steering: "no" } }, 2) });
  assert.deepEqual(bad.queue.steering, ["a"], "a malformed snapshot must not clear the queue");
  assert.equal(bad.queue.revision, 1, "a rejected snapshot does not bump the revision");
});

test("live tool results stay after the tool ends until history echoes them", () => {
  const state = run(streamingState(), [
    { type: "frame", at: 1001, frame: frame("tool_execution_start", { toolCallId: "call-1", toolName: "bash", partialResult: { content: [{ type: "text", text: "working" }] } }, 2) },
    { type: "frame", at: 1002, frame: frame("tool_execution_end", { toolCallId: "call-1", toolName: "bash", result: { content: [{ type: "text", text: "done" }] } }, 3) },
  ]);
  assert.equal(state.toolResults["call-1"].partial, false);
  assert.equal(state.toolResults["call-1"].content[0].text, "done");

  const restarted = reduce(state, { type: "frame", at: 1003, frame: frame("agent_start", {}, 4) });
  assert.equal(restarted.toolResults["call-1"].content[0].text, "done", "a new run must not drop finished output");

  const echoed = reduce(state, {
    type: "history",
    messages: [{ role: "toolResult", toolCallId: "call-1", content: [{ type: "text", text: "done" }] }],
    entryIds: ["e1"],
  });
  assert.equal(echoed.toolResults["call-1"], undefined);
});

test("an end frame without output keeps the streamed partial", () => {
  const state = run(streamingState(), [
    { type: "frame", at: 1001, frame: frame("tool_execution_update", { toolCallId: "call-1", toolName: "bash", partialResult: { content: [{ type: "text", text: "working" }] } }, 2) },
    { type: "frame", at: 1002, frame: frame("tool_execution_end", { toolCallId: "call-1" }, 3) },
  ]);
  assert.equal(state.toolResults["call-1"].partial, false);
  assert.equal(state.toolResults["call-1"].content[0].text, "working");
});

test("notices keep only the most recent five", () => {
  let state = initialState("sess-1");
  for (let index = 0; index < 7; index += 1) {
    state = reduce(state, { type: "notice", notice: { id: `n${index}`, type: "info", message: `m${index}`, at: index } });
  }
  assert.deepEqual(state.notices.map((notice) => notice.message), ["m2", "m3", "m4", "m5", "m6"]);
});

test("error frames never throw on unknown shapes", () => {
  const state = reduce(initialState("sess-1"), { type: "frame", at: 1, frame: { type: "server_error", web: { streamId: "s1", sequence: 1 } } });
  assert.equal(state.lastError, "The agent reported an error.");
});

test("unknown frames and actions leave state untouched", () => {
  const state = initialState("sess-1");
  assert.equal(reduce(state, { type: "frame", at: 1, frame: { type: "totally_new_frame" } }), state);
});
