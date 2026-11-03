import { api } from "./client";
import { errorInfo } from "./agent";
import { isRecord } from "./guards";
import type { paths } from "./schema";

/**
 * Subagent wire types and fetches.
 *
 * The live roster arrives over the `subagents` channel (contract/events.md);
 * these HTTP calls serve the first paint when that channel is unavailable and
 * the per-agent transcript page.
 */

type RosterPayload = NonNullable<
  paths["/api/agent/sessions/{id}/subagents"]["get"]["responses"][200]["content"]["application/json"]
>;
export type SubagentRow = RosterPayload["subagents"][number];

type TranscriptPayload = NonNullable<
  paths["/api/agent/sessions/{id}/subagents/{subagentId}"]["get"]["responses"][200]["content"]["application/json"]
>;
export type SubagentTranscriptPage = TranscriptPayload;

/** One compact live-activity entry (a tool call, an assistant line, a notice). */
export interface SubagentActivityEvent {
  kind: "tool" | "text" | "notice";
  label: string;
  ts: number;
}

/** A complete roster snapshot from the `subagents` channel. */
export interface SubagentsFrame {
  type: "subagents";
  revision: number;
  /** False when the roster came from disk only (no live wrapper). */
  live: boolean;
  roster: SubagentRow[];
  activity: Record<string, SubagentActivityEvent[]>;
}

function parseActivity(value: unknown): SubagentActivityEvent | null {
  if (!isRecord(value)) return null;
  if (value.kind !== "tool" && value.kind !== "text" && value.kind !== "notice") return null;
  if (typeof value.label !== "string" || typeof value.ts !== "number") return null;
  return { kind: value.kind, label: value.label, ts: value.ts };
}

/** Total parse of a `subagents` frame: malformed payloads return null. */
export function parseSubagentsFrame(value: unknown): SubagentsFrame | null {
  if (!isRecord(value) || value.type !== "subagents") return null;
  if (typeof value.revision !== "number" || !Array.isArray(value.roster)) return null;
  const roster = value.roster.filter(
    (row): row is SubagentRow =>
      isRecord(row) && typeof row.id === "string" && typeof row.agent === "string" && typeof row.status === "string",
  );
  const activity: Record<string, SubagentActivityEvent[]> = {};
  if (isRecord(value.activity)) {
    for (const [id, entries] of Object.entries(value.activity)) {
      if (!Array.isArray(entries)) continue;
      const parsed = entries.map(parseActivity).filter((entry): entry is SubagentActivityEvent => entry !== null);
      if (parsed.length > 0) activity[id] = parsed;
    }
  }
  return {
    type: "subagents",
    revision: value.revision,
    live: value.live === true,
    roster,
    activity,
  };
}

/** On-disk roster of one session. Used when the live channel is unavailable. */
export async function fetchSubagentRoster(sessionId: string): Promise<SubagentRow[]> {
  const { data, error, response } = await api.GET("/api/agent/sessions/{id}/subagents", {
    params: { path: { id: sessionId } },
  });
  if (error) throw new Error(errorInfo(error, response.status).message);
  return Array.isArray(data?.subagents) ? data.subagents : [];
}

export type SubagentPageOptions =
  | { mode: "tail" }
  | { fromByte: number };

/**
 * One page of a subagent transcript. `mode: "tail"` asks for the last page so a
 * long running transcript opens where the agent is.
 */
export async function fetchSubagentPage(
  sessionId: string,
  subagentId: string,
  options: SubagentPageOptions,
): Promise<SubagentTranscriptPage> {
  const query = "mode" in options ? { mode: "tail" as const } : { fromByte: String(options.fromByte) };
  const { data, error, response } = await api.GET("/api/agent/sessions/{id}/subagents/{subagentId}", {
    params: { path: { id: sessionId, subagentId }, query },
  });
  if (error) throw new Error(errorInfo(error, response.status).message);
  if (!data) throw new Error("Unexpected empty subagent transcript response");
  return data;
}

/** The subagent's final output artifact (`<id>.md`), if it produced one. */
export async function fetchSubagentCompletion(sessionId: string, subagentId: string): Promise<string | null> {
  const { data, error, response } = await api.GET("/api/agent/sessions/{id}/subagents/{subagentId}", {
    params: { path: { id: sessionId, subagentId }, query: { mode: "completion" } },
  });
  if (error) throw new Error(errorInfo(error, response.status).message);
  return data?.completion ?? null;
}
