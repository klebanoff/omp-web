import { afterEach, describe, expect, it, vi } from "vitest";
import { createSseParser, EventStreamClient, type SseFrame } from "./events";

describe("createSseParser", () => {
  it("parses frames split across chunks", () => {
    const frames: SseFrame[] = [];
    const parse = createSseParser((frame) => frames.push(frame));
    parse('event: mux\ndata: {"type":"hello"}\n\n');
    parse('event: s1\ndata: {"type":"snap');
    parse('shot","history":true}\n\n');
    expect(frames).toEqual([
      { event: "mux", data: '{"type":"hello"}' },
      { event: "s1", data: '{"type":"snapshot","history":true}' },
    ]);
  });

  it("handles CRLF, comments, and multi-line data", () => {
    const frames: SseFrame[] = [];
    const parse = createSseParser((frame) => frames.push(frame));
    parse(": heartbeat\r\n\r\nevent: s1\r\ndata: one\r\ndata: two\r\n\r\n");
    expect(frames).toEqual([{ event: "s1", data: "one\ntwo" }]);
  });

  it("ignores frames without an event name", () => {
    const frames: SseFrame[] = [];
    const parse = createSseParser((frame) => frames.push(frame));
    parse("data: orphan\n\n");
    expect(frames).toEqual([]);
  });
});

describe("EventStreamClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens a new socket when the server no longer knows the connection", async () => {
    let gets = 0;
    let posts = 0;
    vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts += 1;
        const status = posts === 1 ? 404 : 200;
        return Promise.resolve(new Response(JSON.stringify({ ok: status === 200 }), { status }));
      }
      gets += 1;
      const connectionId = gets === 1 ? "stale" : "live";
      const body = `event: mux\ndata: ${JSON.stringify({ type: "hello", connectionId })}\n\n`;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          init?.signal?.addEventListener("abort", () => {
            controller.error(new DOMException("aborted", "AbortError"));
          }, { once: true });
        },
      });
      return Promise.resolve(new Response(stream, { status: 200 }));
    });

    const client = new EventStreamClient();
    await client.subscribe({ kind: "running" }, () => {});
    expect(gets).toBeGreaterThanOrEqual(2);
    expect(posts).toBeGreaterThanOrEqual(2);
    client.close();
  });
});
