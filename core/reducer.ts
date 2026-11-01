import type { AgentMessage, AssistantMessage, ToolResultMessage, UserMessage } from "./types";
import { isRecord } from "./guards";
import {
  isTerminalAgentEnd,
  readAssistantPayload,
  readCursor,
  readErrorMessage,
  readQueueSnapshot,
  readTerminalAgentError,
  readToolResult,
  type WireEvent,
} from "./protocol";
import {
  MAX_NOTICES,
  hasVisibleAssistantContent,
  isHoldableAssistant,
  userMessageText,
  type ConnectionStatus,
  type Notice,
  type SessionState,
  type StreamState,
} from "./state";

const IDLE_STREAM: StreamState = { active: false, message: null, held: [] };

/**
 * Pure transition function for one session.
 *
 * Every input is data — a wire frame, a history read, a user intent — and every
 * output is state. No timers, no I/O, no rendering: the same sequence of
 * actions produces the same state, which is what makes the behaviour testable.
 */

export type SessionAction =
  | { type: "connection"; status: ConnectionStatus; streamId?: string | null }
  | { type: "frame"; frame: WireEvent; at: number }
  | { type: "history"; messages: AgentMessage[]; entryIds: string[] }
  | { type: "prompt"; message: UserMessage }
  | { type: "prompt-settled"; accepted: boolean; reason?: string; at: number }
  | { type: "notice"; notice: Notice }
  | { type: "dismiss-notice"; id: string }
  | { type: "view"; view: Partial<SessionState["view"]> }
  | { type: "reset"; sessionId: string | null }
  | { type: "session-id"; sessionId: string }
  | { type: "clear-live" }
  | { type: "stream-reset"; streamId: string };

export function reduce(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "connection":
      return applyConnection(state, action.status, action.streamId);
    case "frame":
      return applyFrame(state, action.frame, action.at);
    case "history":
      return applyHistory(state, action.messages, action.entryIds);
    case "prompt":
      return { ...state, optimistic: action.message, lastError: null };
    case "prompt-settled": {
      if (action.accepted) return state;
      const notices = pushNotice(state, {
        id: `prompt-${action.at}`,
        type: "error",
        message: action.reason ?? "The prompt was rejected.",
        at: action.at,
      });
      return { ...notices, optimistic: null, lastError: action.reason ?? "The prompt was rejected." };
    }
    case "notice":
      return pushNotice(state, action.notice);
    case "dismiss-notice":
      return { ...state, notices: state.notices.filter((notice) => notice.id !== action.id) };
    case "view":
      return {
        ...state,
        view: { ...state.view, ...action.view },
        // A different branch or compaction window is a different transcript.
        historyRevision: state.historyRevision + 1,
      };
    case "reset":
      return {
        ...state,
        sessionId: action.sessionId,
        view: { leafId: null, includePreCompaction: false },
        messages: [],
        entryIds: [],
        optimistic: null,
        stream: IDLE_STREAM,
        queue: { steering: [], followUp: [], revision: state.queue.revision + 1 },
        toolResults: {},
        run: { ...state.run, status: "idle", hadContent: false, error: null },
        notices: [],
        lastError: null,
        sequence: 0,
        streamId: null,
        historyRevision: state.historyRevision + 1,
      };
    case "session-id":
      return state.sessionId === action.sessionId ? state : { ...state, sessionId: action.sessionId };
    case "clear-live":
      return {
        ...state,
        stream: IDLE_STREAM,
        toolResults: {},
      };
    case "stream-reset":
      return {
        ...state,
        streamId: action.streamId,
        sequence: 0,
        stream: IDLE_STREAM,
        toolResults: {},
      };
    default:
      return state;
  }
}

function applyConnection(
  state: SessionState,
  status: ConnectionStatus,
  streamId?: string | null,
): SessionState {
  const nextStreamId = streamId === undefined ? state.streamId : streamId;
  const streamChanged = nextStreamId !== state.streamId;
  return {
    ...state,
    connection: status,
    streamId: nextStreamId,
    sequence: streamChanged ? 0 : state.sequence,
    // A new stream means the runtime restarted: live snapshots and ordering
    // from the previous one are meaningless, and the transcript must be re-read.
    stream: streamChanged ? IDLE_STREAM : state.stream,
    toolResults: streamChanged ? {} : state.toolResults,
    historyRevision: streamChanged ? state.historyRevision + 1 : state.historyRevision,
  };
}

/** Apply a live frame, dropping anything the stream already moved past. */
function applyFrame(state: SessionState, frame: WireEvent, at: number): SessionState {
  const cursor = readCursor(frame);
  let next = state;

  if (cursor?.streamId && cursor.streamId !== state.streamId) {
    next = applyConnection(state, state.connection, cursor.streamId);
    if (cursor.sequence !== null) next = { ...next, sequence: cursor.sequence };
  } else if (cursor?.sequence !== null && cursor?.sequence !== undefined) {
    if (cursor.sequence <= next.sequence) return state;
    next = { ...next, sequence: cursor.sequence };
  }

  switch (frame.type) {
    case "connected":
      return { ...next, connection: "open" };

    case "agent_start":
      return {
        ...next,
        run: { status: "running", id: next.run.id + 1, hadContent: false, error: null },
        // Keep finished steps from the previous turn until history echoes them.
        stream: { active: true, message: null, held: next.stream.held },
        historyRevision: next.historyRevision + 1,
      };

    case "message_start":
      // A new message may be a steering prompt while a partial reply is still
      // on screen; keep that partial until its own message_end arrives.
      return {
        ...next,
        stream: { active: true, message: next.stream.message, held: next.stream.held },
      };

    case "message_update": {
      const message = readAssistantPayload(frame.message);
      if (!message) return next;
      return {
        ...next,
        stream: { active: true, message, held: next.stream.held },
        run: {
          ...next.run,
          hadContent: next.run.hadContent || hasVisibleAssistantContent(message),
        },
      };
    }

    case "message_end": {
      const raw = frame.message;
      const toolCallId = isRecord(raw) && raw.role === "toolResult" && typeof raw.toolCallId === "string"
        ? raw.toolCallId
        : null;
      const settled = toolCallId ? readToolResult(raw, toolCallId, false) : null;
      const toolResults = settled
        ? { ...next.toolResults, [settled.toolCallId]: settleToolResult(next.toolResults[settled.toolCallId], settled) }
        : next.toolResults;
      const payload = readAssistantPayload(raw);
      // A user steering message or a tool result does not end the assistant
      // stream; only the assistant message itself does.
      if (!payload) return toolResults === next.toolResults ? next : { ...next, toolResults };
      const visible = hasVisibleAssistantContent(payload);
      return {
        ...next,
        toolResults,
        stream: { active: false, message: null, held: retainAssistant(next.stream.held, payload) },
        run: { ...next.run, hadContent: next.run.hadContent || visible },
      };
    }

    case "agent_end": {
      if (!isTerminalAgentEnd(frame)) return next;
      const error = readTerminalAgentError(frame) ?? next.run.error;
      const withNotice = error ? pushNotice(next, noticeFor(next, "error", error, at)) : next;
      return {
        ...withNotice,
        run: { ...withNotice.run, status: "idle", error },
        stream: { ...withNotice.stream, active: false },
        lastError: error ?? withNotice.lastError,
        // The wrapper clears live output before handing us agent_end, and the
        // committed messages only exist in the session file. Re-read on every
        // terminal run, not just silent ones, or the transcript stays empty.
        historyRevision: withNotice.historyRevision + 1,
      };
    }

    case "tool_execution_start":
    case "tool_execution_update": {
      const toolCallId = typeof frame.toolCallId === "string" ? frame.toolCallId : null;
      const result = readToolResult(frame, toolCallId);
      if (!result || !toolCallId) return next;
      const existing = next.toolResults[toolCallId];
      return {
        ...next,
        toolResults: { ...next.toolResults, [toolCallId]: { ...existing, ...result } },
      };
    }

    case "tool_execution_end": {
      const toolCallId = typeof frame.toolCallId === "string" ? frame.toolCallId : null;
      const incoming = readToolResult(frame, toolCallId, false);
      if (!incoming || !toolCallId) return next;
      return {
        ...next,
        toolResults: {
          ...next.toolResults,
          [toolCallId]: settleToolResult(next.toolResults[toolCallId], incoming),
        },
      };
    }

    case "queue_update": {
      const snapshot = readQueueSnapshot(frame.queuedMessages ?? frame.queue ?? frame);
      if (!snapshot) return next;
      return { ...next, queue: { ...snapshot, revision: next.queue.revision + 1 } };
    }

    case "prompt_result": {
      const error = readErrorMessage(frame);
      if (!error) return { ...next, optimistic: null };
      return reduce(
        { ...next, optimistic: null },
        { type: "notice", notice: noticeFor(next, "error", error, at) },
      );
    }

    case "session_history_changed":
      return { ...next, historyRevision: next.historyRevision + 1 };

    case "turn_error":
    case "agent_error":
    case "model_error":
    case "server_error":
    case "internal_error":
    case "rpc_frame_error":
    case "error": {
      const message = readErrorMessage(frame) ?? "The agent reported an error.";
      return {
        ...pushNotice(next, noticeFor(next, "error", message, at)),
        run: { ...next.run, error: message },
        lastError: message,
      };
    }

    case "notice": {
      const message = readErrorMessage(frame);
      if (!message) return next;
      const kind = typeof frame.level === "string" && isNoticeType(frame.level) ? frame.level : "info";
      return pushNotice(next, noticeFor(next, kind, message, at));
    }

    default:
      return next;
  }
}

function applyHistory(
  state: SessionState,
  messages: AgentMessage[],
  entryIds: string[],
): SessionState {
  const optimistic = state.optimistic
    && messages.some((message) => message.role === "user" && userMessageText(message) === userMessageText(state.optimistic!))
    ? null
    : state.optimistic;

  return {
    ...state,
    messages,
    entryIds,
    optimistic,
    stream: releaseHeldStream(state.stream, messages),
    toolResults: releaseCommittedTools(state.toolResults, messages),
  };
}

/** Keep streamed output when the end frame has no content of its own. */
function settleToolResult(
  existing: ToolResultMessage | undefined,
  incoming: ToolResultMessage,
): ToolResultMessage {
  const content = incoming.content.length > 0 ? incoming.content : existing?.content ?? [];
  return { ...existing, ...incoming, content, partial: false };
}

/** Drop a live tool result once the committed transcript has that call. */
function releaseCommittedTools(
  toolResults: SessionState["toolResults"],
  messages: AgentMessage[],
): SessionState["toolResults"] {
  const committed = new Set<string>();
  for (const message of messages) {
    if (message.role === "toolResult" && message.toolCallId) committed.add(message.toolCallId);
  }
  if (committed.size === 0) return toolResults;
  let changed = false;
  const next: SessionState["toolResults"] = {};
  for (const [id, result] of Object.entries(toolResults)) {
    if (committed.has(id)) changed = true;
    else next[id] = result;
  }
  return changed ? next : toolResults;
}

/** Append one finished assistant step, ignoring empties and duplicate timestamps. */
function retainAssistant(
  held: Partial<AssistantMessage>[],
  message: Partial<AssistantMessage> | null,
): Partial<AssistantMessage>[] {
  if (!message || !isHoldableAssistant(message)) return held;
  const timestamp = message.timestamp;
  if (timestamp !== undefined && held.some((item) => item.timestamp === timestamp)) return held;
  return [...held, message];
}

/** Drop finished replies once the committed transcript shows them. */
function releaseHeldStream(stream: StreamState, messages: AgentMessage[]): StreamState {
  if (stream.held.length === 0) return stream;
  const held = stream.held.filter((message) => !assistantCommitted(message, messages));
  return held.length === stream.held.length ? stream : { ...stream, held };
}

function assistantCommitted(message: Partial<AssistantMessage>, messages: AgentMessage[]): boolean {
  // No timestamp means the next history read is the only signal we get.
  if (message.timestamp === undefined) return true;
  return messages.some((item) => item.role === "assistant" && item.timestamp === message.timestamp);
}

/** Deterministic id: the reducer stays a pure function of state and input. */
function noticeFor(state: SessionState, type: Notice["type"], message: string, at: number): Notice {
  return { id: `${type}:${at}:${state.notices.length}`, type, message, at };
}

function pushNotice(state: SessionState, notice: Notice): SessionState {
  const notices = [...state.notices, notice];
  return { ...state, notices: notices.slice(Math.max(0, notices.length - MAX_NOTICES)) };
}

function isNoticeType(value: string): value is Notice["type"] {
  return value === "info" || value === "success" || value === "warning" || value === "error";
}
