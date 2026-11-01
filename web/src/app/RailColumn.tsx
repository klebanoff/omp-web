import { useEffect } from "react";
import { useProjects } from "@/features/projects/use-projects";
import { useSessions } from "@/features/sessions/use-sessions";
import { getLayout, updateLayout } from "@/layout/layout-store";
import { ResizeHandle } from "@/layout/ResizeHandle";
import { useLayoutField } from "@/layout/use-layout";
import { skinFor } from "@/skins/registry";
import { publishSessionCatalog } from "@/state/session-catalog";
import { useAppearance } from "@/state/use-appearance";
import { useRunningSessions } from "@/state/event-stream";
import styles from "./app.module.css";

const EMPTY_RUNNING: string[] = [];

interface RailColumnProps {
  selected: string | null;
  pendingId: string | null;
  onPendingListed: () => void;
  onSelect: (sessionId: string) => void;
  onNewSession: (projectPath?: string) => void;
  onOpenSettings: () => void;
}

export function RailColumn({
  selected,
  pendingId,
  onPendingListed,
  onSelect,
  onNewSession,
  onOpenSettings,
}: RailColumnProps) {
  const appearance = useAppearance();
  const collapsed = useLayoutField("railCollapsed");
  const width = useLayoutField("railWidth");
  const sessions = useSessions();
  const projects = useProjects();
  const fallbackRunning = sessions.data?.runningSessionIds ?? EMPTY_RUNNING;
  const running = useRunningSessions(fallbackRunning);
  const RailSkin = skinFor("rail", appearance);

  useEffect(() => {
    publishSessionCatalog(sessions.data?.sessions ?? [], projects.data ?? []);
  }, [sessions.data, projects.data]);

  useEffect(() => {
    if (!pendingId) return;
    if (sessions.data?.sessions.some((item) => item.id === pendingId)) onPendingListed();
  }, [pendingId, sessions.data, onPendingListed]);

  if (collapsed) {
    return (
      <button
        type="button"
        className={styles.showRail}
        onClick={() => updateLayout({ railCollapsed: false })}
        title="Show sessions"
        aria-label="Show sessions"
      >
        ☰
      </button>
    );
  }

  return (
    <>
      <div className={styles.railPane} style={{ width }}>
        <RailSkin
          sessions={sessions.data?.sessions ?? []}
          projects={projects.data ?? []}
          selected={selected}
          running={running}
          loading={sessions.isLoading}
          error={sessions.isError ? sessions.error.message : null}
          onSelect={onSelect}
          onNewSession={onNewSession}
          onRefresh={() => {
            void sessions.refetch();
            void projects.refetch();
          }}
          onCollapse={() => updateLayout({ railCollapsed: true })}
          onOpenSettings={onOpenSettings}
        />
      </div>
      <ResizeHandle
        label="Resize session rail"
        onDelta={(delta) => updateLayout({ railWidth: getLayout().railWidth + delta })}
        onReset={() => updateLayout({ railWidth: 248 })}
      />
    </>
  );
}
