import assert from "node:assert/strict";
import { test } from "bun:test";

const { EventStreamConnection, getEventStreamConnection } = await import("./event-stream-hub.ts");

test("an already aborted request does not publish a connection id", async () => {
  const abort = new AbortController();
  abort.abort();
  const connection = new EventStreamConnection(abort.signal);
  const reader = connection.stream.getReader();
  const first = await reader.read();
  assert.equal(first.done, true);
  assert.equal(getEventStreamConnection(connection.id), undefined);
  assert.equal(connection.isClosed, true);
});
