import type { ProjectSummary, SessionSummary } from "@/api/workspace";

export interface RailSlotProps {
  sessions: SessionSummary[];
  projects: ProjectSummary[];
  selected: string | null;
  running: ReadonlySet<string>;
  /** Days of silence after which a conversation folds into its group's `Older` rows; `0` = never. */
  hideInactiveAfterDays: number;
  loading: boolean;
  error: string | null;
  onSelect: (sessionId: string) => void;
  onNewSession: (projectPath?: string) => void;
  onRefresh: () => void;
  onCollapse: () => void;
  onOpenSettings: () => void;
  /** Opens the browser folder dialog and registers the chosen directory. */
  onAddWorkspace: () => void;
}
