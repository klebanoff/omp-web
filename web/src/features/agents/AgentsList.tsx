import { useRef, type JSX } from "react";
import type { SubagentRow } from "@/api/subagents";
import { useActiveSubagents, useAgentRows } from "@/state/use-subagents";
import { formatDuration, formatElapsed } from "./format";
import { openAgent } from "./open-agent";
import styles from "./agents.module.css";

/**
 * Roster of the session's subagents, rendered as the workbench navigator.
 *
 * Subscribes to the subagent store itself (a leaf), so the workbench shell and
 * the tab strip never repaint on a progress frame. Opening a row is a layout
 * intent, not a session rule: `openAgent` focuses the tab.
 */
export function AgentsList({ sessionId }: { sessionId: string }): JSX.Element {
  const { rows, live, loading } = useAgentRows(sessionId);
  const rowsRef = useRef<HTMLDivElement>(null);
  const running = rows.filter((row) => row.status === "started");
  const finished = rows.filter((row) => row.status !== "started");

  const focusRow = (delta: number): void => {
    const buttons = Array.from(
      rowsRef.current?.querySelectorAll<HTMLButtonElement>("button[data-agent-row]") ?? [],
    );
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = current < 0 ? 0 : Math.min(buttons.length - 1, Math.max(0, current + delta));
    buttons[next]?.focus();
  };

  return (
    <div className={styles.list}>
      <div className={styles.header}>
        Agents
        <span className={styles.spacer} />
        {running.length > 0 ? `${running.length} running` : live ? "this session" : "history"}
      </div>

      <div
        className={styles.rows}
        ref={rowsRef}
        role="list"
        aria-label="Session subagents"
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            focusRow(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            focusRow(-1);
          }
        }}
      >
        {loading ? <p className={styles.empty}>Loading agents…</p> : null}
        {!loading && rows.length === 0 ? (
          <p className={styles.empty}>No subagents in this session yet.</p>
        ) : null}

        {running.length > 0 ? <div className={styles.group}>Running · {running.length}</div> : null}
        {running.map((row) => (
          <AgentRow key={row.id} sessionId={sessionId} row={row} />
        ))}

        {finished.length > 0 ? <div className={styles.group}>Finished · {finished.length}</div> : null}
        {finished.map((row) => (
          <AgentRow key={row.id} sessionId={sessionId} row={row} />
        ))}
      </div>

      <div className={styles.footer}>
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> move
        </span>
        <span>
          <kbd>Enter</kbd> open
        </span>
        <span className={styles.spacer} />
      </div>
    </div>
  );
}

function AgentRow({ sessionId, row }: { sessionId: string; row: SubagentRow }): JSX.Element {
  const running = row.status === "started";
  const duration = row.durationMs ?? row.progress?.durationMs;
  const time = running ? formatElapsed(duration) : formatDuration(duration);
  const detail = running
    ? (row.progress?.currentTool ? `${row.progress.currentTool}${row.progress.currentToolArgs ? ` · ${row.progress.currentToolArgs}` : ""}` : firstLine(row.task ?? row.assignment ?? row.description))
    : firstLine(row.task ?? row.assignment ?? row.description);

  return (
    <button
      type="button"
      className={styles.row}
      data-agent-row={row.id}
      role="listitem"
      aria-label={`${row.agent} ${row.id} — ${row.status}`}
      title={row.task ?? row.assignment ?? row.id}
      onClick={() => openAgent(sessionId, row.id, row.id)}
    >
      <span
        className={[
          styles.dot,
          running ? styles.dotRunning : "",
          row.status === "failed" ? styles.dotFailed : "",
          row.status === "aborted" ? styles.dotAborted : "",
        ].filter(Boolean).join(" ")}
        aria-hidden="true"
      />
      <span className={styles.body}>
        <span className={styles.top}>
          <span className={styles.name}>{row.id}</span>
          {!running && row.agent !== row.id ? <span className={styles.chip}>{row.agent}</span> : null}
          {time !== "" ? <span className={styles.time}>{time}</span> : null}
        </span>
        {detail !== "" ? <span className={styles.task}>{detail}</span> : null}
      </span>
    </button>
  );
}

/** First non-empty line, collapsed to one line of text. */
function firstLine(value?: string): string {
  if (typeof value !== "string") return "";
  const line = value.split("\n").find((candidate) => candidate.trim() !== "") ?? "";
  return line.trim();
}

/** Running-count badge for the "Agents" navigator pill (a leaf on purpose). */
export function AgentsRunningCount({
  sessionId,
  className,
}: {
  sessionId: string;
  className: string | undefined;
}): JSX.Element | null {
  const running = useActiveSubagents(sessionId);
  if (running.length === 0) return null;
  return <span className={className}>{running.length}</span>;
}
