import { useEffect, useRef, type JSX } from "react";
import { closeTab, subagentTabId } from "@/layout/layout-store";
import { getAgentRoster } from "@/state/subagents-store";
import { useSubagent } from "@/state/use-subagents";
import { openAgent } from "./open-agent";
import { formatCost, formatDuration, formatElapsed, formatTokens, modelLabel } from "./format";
import styles from "./subagent.module.css";

export interface SubagentViewProps {
  sessionId: string;
  subagentId: string;
}

const STATUS_LABEL: Record<string, string> = {
  started: "Working",
  completed: "Completed",
  failed: "Failed",
  aborted: "Aborted",
};

/**
 * Read-only view of one subagent: its identity and task now, its transcript
 * next (loaded from the subagent page route, never from the parent stream).
 *
 * Subscribes to its own roster row, so a sibling's progress frame does not
 * re-render this tab.
 */
export function SubagentView({ sessionId, subagentId }: SubagentViewProps): JSX.Element {
  const row = useSubagent(sessionId, subagentId);
  const rootRef = useRef<HTMLDivElement>(null);

  // Tab-local keys, scoped to this view: a global Escape handler would fight
  // the system panel and the extension dialog, and plain arrows must keep
  // scrolling the transcript.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || !rootRef.current?.contains(event.target as Node | null)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeTab(sessionId, subagentTabId(subagentId));
        return;
      }
      if ((event.key !== "ArrowUp" && event.key !== "ArrowDown") || !event.altKey) return;
      const roster = getAgentRoster(sessionId)?.roster ?? [];
      const index = roster.findIndex((entry) => entry.id === subagentId);
      if (index < 0) return;
      const next = roster[index + (event.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      event.preventDefault();
      openAgent(sessionId, next.id, next.id);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [sessionId, subagentId]);

  const running = row?.status === "started";
  const duration = row?.durationMs ?? row?.progress?.durationMs;
  const model = modelLabel(row?.resolvedModel ?? row?.progress?.resolvedModel);
  const tokens = formatTokens(row?.tokens ?? row?.progress?.tokens);
  const cost = formatCost(row?.cost ?? row?.progress?.cost);
  const tools = row?.toolCount ?? row?.progress?.toolCount;
  const task = row?.task ?? row?.assignment ?? row?.description ?? "";
  const status = row ? (STATUS_LABEL[row.status] ?? row.status) : "Not in this session";

  return (
    <div className={styles.view} ref={rootRef}>
      <header className={styles.header}>
        <div className={styles.headline}>
          <span className={styles.name}>{row?.id ?? subagentId}</span>
          <span
            className={[
              styles.status,
              running ? styles.statusRunning : "",
              row?.status === "failed" ? styles.statusFailed : "",
            ].filter(Boolean).join(" ")}
          >
            {running ? <span className={styles.pulse} aria-hidden="true" /> : null}
            {status}
          </span>
          {row && row.agent !== row.id ? <span className={styles.meta}>{row.agent}</span> : null}
        </div>

        <div className={styles.meta}>
          {duration !== undefined ? (
            <span>
              {running ? "Elapsed" : "Took"} <b>{running ? formatElapsed(duration) : formatDuration(duration)}</b>
            </span>
          ) : null}
          {model ? (
            <span>
              Model <b>{model.effort ? `${model.model} · ${model.effort}` : model.model}</b>
            </span>
          ) : null}
          {tools !== undefined ? (
            <span>
              Tools <b>{tools}</b>
            </span>
          ) : null}
          {tokens !== "" ? (
            <span>
              Tokens <b>{tokens}</b>
            </span>
          ) : null}
          {cost !== "" ? (
            <span>
              Cost <b>{cost}</b>
            </span>
          ) : null}
        </div>

        {task !== "" ? <div className={styles.task}>{task}</div> : null}
      </header>

      <div className={styles.body} aria-label="Subagent transcript" />

      <footer className={styles.footer}>
        <span>Transcript is read-only — drive the parent chat instead.</span>
        <span className={styles.spacer} />
        <span>
          <kbd>Alt</kbd>+<kbd>↑</kbd> <kbd>↓</kbd> switch agent
        </span>
        <span>
          <kbd>Esc</kbd> close
        </span>
      </footer>
    </div>
  );
}
