import { useEffect, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { dispatchIntent } from "@/api/agent";
import { basename, comparablePath } from "@/api/paths";
import { fetchGitStatus } from "@/api/workspace";
import { forgetEditorTab, renameEditorTab } from "@/features/workbench/editor-state";
import { ChangesControl } from "@/features/workbench/ChangesControl";
import {
  addWorkbenchRoot,
  closeTab,
  closeTabsForPath,
  ensureWorkbenchRoots,
  getLayout,
  openDiffTab,
  openFileTab,
  openTerminalTab,
  removeWorkbenchRoot,
  renameFileTabs,
  setActiveTab,
  setChangesScroll,
  setTabScroll,
  setTreeScroll,
  setWorkbenchView,
  toggleExpanded,
  updateLayout,
  type WorkbenchView,
} from "@/layout/layout-store";
import { ResizeHandle } from "@/layout/ResizeHandle";
import { useLayoutField, useWorkbench } from "@/layout/use-layout";
import { skinFor } from "@/skins/registry";
import type { FilesGitState } from "@/slots/files";
import { useWorkspaceEvents } from "@/state/event-stream";
import { useAllDiagnostics } from "@/state/lsp-store";
import { useCatalogProjects, useSessionPaths } from "@/state/session-catalog";
import { bumpStreamGeneration } from "@/state/stream-generation";
import { useAppearance } from "@/state/use-appearance";
import styles from "./app.module.css";

interface WorkbenchColumnProps {
  selected: string;
  /** Cwd of a session that is not in the catalog yet. */
  pendingCwd: string | null;
}

export function WorkbenchColumn({ selected, pendingCwd }: WorkbenchColumnProps) {
  const appearance = useAppearance();
  const collapsed = useLayoutField("workbenchCollapsed");
  const width = useLayoutField("workbenchWidth");
  const navigatorWidth = useLayoutField("navigatorWidth");
  const navigatorCollapsed = useLayoutField("navigatorCollapsed");
  const paths = useSessionPaths(selected);
  const root = paths.root ?? pendingCwd;
  const projectLabel = paths.root ? paths.label : pendingCwd ? basename(pendingCwd) : "";
  const projects = useCatalogProjects();
  const workbench = useWorkbench(selected);
  const workbenchRoots = workbench.roots;
  useWorkspaceEvents(workbenchRoots);
  const problemsEnabled = workbench.view === "problems";
  const problems = useAllDiagnostics(workbenchRoots, problemsEnabled);
  const FilesSkin = skinFor("files", appearance);

  useEffect(() => {
    if (root) ensureWorkbenchRoots(selected, root);
  }, [selected, root]);

  const gitQueries = useQueries({
    queries: workbenchRoots.map((root) => ({
      queryKey: ["git-status", root],
      queryFn: () => fetchGitStatus(root),
      enabled: !collapsed,
      staleTime: 3_000,
      refetchInterval: collapsed ? false : 10_000,
    })),
  });
  const gitStamp = gitQueries
    .map((query) => `${query.dataUpdatedAt}:${query.status}:${query.fetchStatus}`)
    .join("|");
  const rootsKey = workbenchRoots.join("\n");
  const gitByRoot = useMemo(() => {
    const states = new Map<string, FilesGitState>();
    workbenchRoots.forEach((root, index) => {
      const query = gitQueries[index];
      states.set(comparablePath(root), {
        status: query?.data,
        loading: query?.isLoading ?? false,
        error: query?.isError ? query.error.message : null,
      });
    });
    return states;
    // `gitStamp` is the query change signal; `rootsKey` captures the root set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gitStamp, rootsKey]);

  const availableProjects = useMemo(
    () => projects.filter(
      (project) => !workbenchRoots.some((root) => comparablePath(root) === comparablePath(project.path)),
    ),
    [projects, workbenchRoots],
  );

  if (collapsed) {
    return (
      <button
        type="button"
        className={styles.showWorkbench}
        onClick={() => updateLayout({ workbenchCollapsed: false })}
        title="Show workbench (Ctrl+Shift+E)"
      >
        Panel
      </button>
    );
  }

  return (
    <>
      <ResizeHandle
        label="Resize workbench"
        onDelta={(delta) => updateLayout({ workbenchWidth: getLayout().workbenchWidth - delta })}
        onReset={() => updateLayout({ workbenchWidth: 720 })}
      />
      <div className={styles.workbenchPane} data-testid="workbench-pane" style={{ width }}>
        <FilesSkin
          sessionId={selected}
          primaryRoot={root}
          projectLabel={projectLabel}
          roots={workbenchRoots}
          view={workbench.view}
          expanded={workbench.expanded}
          tabs={workbench.tabs}
          activeTabId={workbench.activeTabId}
          treeScrollTop={workbench.treeScrollTop}
          changesScrollTop={workbench.changesScrollTop}
          navigatorWidth={navigatorWidth}
          navigatorCollapsed={navigatorCollapsed}
          gitByRoot={gitByRoot}
          problems={problems}
          availableProjects={availableProjects}
          ChangesView={ChangesControl}
          onClose={() => updateLayout({ workbenchCollapsed: true })}
          onSelectView={(view: WorkbenchView) => setWorkbenchView(selected, view)}
          onToggleExpanded={(path) => toggleExpanded(selected, path)}
          onOpenFile={(path, preview) => openFileTab(selected, path, preview)}
          onOpenFileAt={(path, line, column) => openFileTab(selected, path, false, { line, column })}
          onOpenTerminal={(terminalRoot) => openTerminalTab(selected, terminalRoot)}
          onAddRoot={(workspaceRoot) => addWorkbenchRoot(selected, workspaceRoot)}
          onRemoveRoot={(workspaceRoot) => {
            for (const id of removeWorkbenchRoot(selected, workspaceRoot)) forgetEditorTab(id);
          }}
          onRenamed={(from, to) => {
            for (const pair of renameFileTabs(selected, from, to)) renameEditorTab(pair.fromId, pair.toId);
          }}
          onDeleted={(path) => {
            for (const id of closeTabsForPath(selected, path)) forgetEditorTab(id);
          }}
          onTreeScroll={(scrollTop) => setTreeScroll(selected, scrollTop)}
          onChangesScroll={(scrollTop) => setChangesScroll(selected, scrollTop)}
          onRefreshGit={(root) => {
            const index = workbenchRoots.findIndex((entry) => comparablePath(entry) === comparablePath(root));
            if (index < 0) return;
            void gitQueries[index]?.refetch();
          }}
          onOpenDiff={(source) => openDiffTab(selected, source)}
          onActivateTab={(tabId) => setActiveTab(selected, tabId)}
          onCloseTab={(tabId) => closeTab(selected, tabId)}
          onTabScroll={(tabId, scrollTop) => setTabScroll(selected, tabId, scrollTop)}
          onToggleNavigator={() => updateLayout({ navigatorCollapsed: !getLayout().navigatorCollapsed })}
          onResizeNavigator={(delta) => updateLayout({ navigatorWidth: getLayout().navigatorWidth + delta })}
          onResetNavigator={() => updateLayout({ navigatorWidth: 220 })}
          onInlinePrompt={async (text) => {
            const result = await dispatchIntent(selected, { kind: "prompt", text });
            if (result.bootstrapped) bumpStreamGeneration();
          }}
        />
      </div>
    </>
  );
}
