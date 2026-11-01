import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent, type Ref, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { comparablePath, dirname, joinPath } from "@/api/paths";
import type { GitFileStatus } from "@/api/workspace";
import { scheduleIdle } from "@/state/schedule-idle";
import { useFileList } from "./use-workbench-data";
import { useFileMutations } from "./use-file-mutations";
import styles from "./file-tree.module.css";

const MAX_ENTRIES = 500;
const ROW_HEIGHT = 22;
const WINDOW_OVERSCAN = 16;
const IDLE_NEIGHBORS = 24;

interface FileTreeProps {
  sessionId: string;
  roots: readonly string[];
  expanded: readonly string[];
  /** Keyed by `comparablePath(root)`. */
  gitFilesByRoot: ReadonlyMap<string, readonly GitFileStatus[]>;
  scrollTop: number;
  onToggle: (path: string) => void;
  onOpen: (path: string, preview: boolean) => void;
  onScroll: (scrollTop: number) => void;
  onRenamed?: (from: string, to: string) => void;
  onDeleted?: (path: string) => void;
  onRemoveRoot?: (root: string) => void;
  onOpenTerminal?: (root: string) => void;
  onDragStartFile?: (event: DragEvent<HTMLDivElement>, path: string, root: string) => void;
}

interface TreeOps {
  rename(from: string, to: string): Promise<boolean>;
  remove(path: string, recursive: boolean): Promise<boolean>;
}

function badgeClass(status: GitFileStatus): string {
  switch (status.status) {
    case "added": return styles.badgeAdded ?? "";
    case "deleted": return styles.badgeDeleted ?? "";
    case "conflict": return styles.badgeConflict ?? "";
    case "renamed": return styles.badgeRenamed ?? "";
    case "untracked": return styles.badgeUntracked ?? "";
    default: return styles.badgeModified ?? "";
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function FileTree({
  sessionId,
  roots,
  expanded,
  gitFilesByRoot,
  scrollTop,
  onToggle,
  onOpen,
  onScroll,
  onRenamed,
  onDeleted,
  onRemoveRoot,
  onOpenTerminal,
  onDragStartFile,
}: FileTreeProps) {
  const treeRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const mutations = useFileMutations(sessionId);
  const [creating, setCreating] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [activeRoot, setActiveRoot] = useState(roots[0] ?? "");

  useEffect(() => {
    if (roots.includes(activeRoot)) return;
    setActiveRoot(roots[0] ?? "");
  }, [roots, activeRoot]);

  const gitByPath = useMemo(() => {
    const map = new Map<string, GitFileStatus>();
    for (const files of gitFilesByRoot.values()) {
      for (const file of files) map.set(comparablePath(file.filePath), file);
    }
    return map;
  }, [gitFilesByRoot]);

  useEffect(() => {
    if (treeRef.current) treeRef.current.scrollTop = scrollTop;
  }, []);

  const report = (text: string, error = false) => {
    setNotice(text ? { text, error } : null);
  };

  const submitNewFile = async () => {
    const relative = newPath.trim();
    if (!relative || !activeRoot) return;
    const target = joinPath(activeRoot, relative);
    try {
      await mutations.createFile(target);
      setNewPath("");
      setCreating(false);
      report(`Created ${relative}`);
      onOpen(target, false);
    } catch (error) {
      report(messageOf(error), true);
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selected = Array.from(files);
    if (!activeRoot) return;
    try {
      const result = await mutations.upload(activeRoot, selected);
      const parts: string[] = [];
      if (result.uploaded.length > 0) parts.push(`${result.uploaded.length} uploaded`);
      if (result.skipped.length > 0) parts.push(`${result.skipped.length} skipped`);
      if (result.errors.length > 0) parts.push(`${result.errors.length} failed`);
      report(parts.join(", ") || "Nothing uploaded", result.errors.length > 0);
    } catch (error) {
      report(messageOf(error), true);
    }
  };

  const ops: TreeOps = {
    rename: async (from, to) => {
      try {
        await mutations.rename(from, to);
        report(`Renamed to ${to}`);
        return true;
      } catch (error) {
        report(messageOf(error), true);
        return false;
      }
    },
    remove: async (path, recursive) => {
      try {
        await mutations.remove(path, recursive);
        report(`Deleted ${path}`);
        return true;
      } catch (error) {
        report(messageOf(error), true);
        return false;
      }
    },
  };

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <button
          className={styles.toolButton}
          onClick={() => {
            setCreating((value) => !value);
            setNewPath("");
          }}
          title="New file"
        >
          + File
        </button>
        <button
          className={styles.toolButton}
          onClick={() => uploadRef.current?.click()}
          disabled={mutations.pending}
          title="Upload files"
        >
          ↑ Upload
        </button>
        <button
          className={styles.toolButton}
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ["file-list"] });
          }}
          title="Refresh"
        >
          ⟳
        </button>
        {roots.length > 1 ? (
          <select
            className={styles.rootSelect}
            aria-label="Workspace folder"
            value={activeRoot}
            onChange={(event) => setActiveRoot(event.currentTarget.value)}
          >
            {roots.map((entry) => (
              <option key={entry} value={entry}>{entry}</option>
            ))}
          </select>
        ) : null}
        <input
          ref={uploadRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            const input = event.currentTarget;
            void uploadFiles(input.files).finally(() => {
              input.value = "";
            });
          }}
        />
      </div>
      {creating ? (
        <div className={styles.newFileRow}>
          <input
            className={styles.inlineInput}
            value={newPath}
            autoFocus
            placeholder="path/inside/workspace.ts"
            onChange={(event) => setNewPath(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitNewFile();
              } else if (event.key === "Escape") {
                setCreating(false);
                setNewPath("");
              }
            }}
          />
          <button className={styles.inlineButton} onClick={() => void submitNewFile()}>Create</button>
          <button
            className={styles.inlineButton}
            onClick={() => {
              setCreating(false);
              setNewPath("");
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className={notice.error ? styles.noticeError : styles.notice}>{notice.text}</div>
      ) : null}
      <div
        className={styles.tree}
        ref={treeRef}
        onScroll={(event) => onScroll(event.currentTarget.scrollTop)}
      >
        {roots.map((root, index) => {
          const files = gitFilesByRoot.get(comparablePath(root)) ?? [];
          return (
            <section key={root} className={styles.rootGroup}>
              <div
                className={activeRoot === root ? `${styles.rootHeader} ${styles.rootHeaderActive}` : styles.rootHeader}
                title={root}
                onClick={() => setActiveRoot(root)}
              >
                <span className={styles.rootTitle}>
                  {root.split(/[\\/]/).filter(Boolean).pop() ?? root}
                </span>
                {files.length > 0 ? <span className={styles.rootCount}>{files.length}</span> : null}
                {onOpenTerminal ? (
                  <button
                    className={styles.rowAction}
                    title={`Terminal — ${root}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenTerminal(root);
                    }}
                  >
                    &gt;_
                  </button>
                ) : null}
                {index > 0 && onRemoveRoot ? (
                  <button
                    className={styles.rowAction}
                    title={`Remove ${root}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveRoot(root);
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
              <DirectoryList
                path={root}
                root={root}
                depth={0}
                sessionId={sessionId}
                expanded={expanded}
                gitByPath={gitByPath}
                scrollRef={treeRef}
                onToggle={onToggle}
                onOpen={onOpen}
                ops={ops}
                {...(onRenamed ? { onRenamed } : {})}
                {...(onDeleted ? { onDeleted } : {})}
                {...(onDragStartFile ? { onDragStartFile } : {})}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}

interface DirectoryListProps {
  path: string;
  root: string;
  depth: number;
  sessionId: string;
  expanded: readonly string[];
  gitByPath: Map<string, GitFileStatus>;
  scrollRef: RefObject<HTMLDivElement | null>;
  onToggle: (path: string) => void;
  onOpen: (path: string, preview: boolean) => void;
  ops: TreeOps;
  onRenamed?: (from: string, to: string) => void;
  onDeleted?: (path: string) => void;
  onDragStartFile?: (event: DragEvent<HTMLDivElement>, path: string, root: string) => void;
}

function useEntryWindow(scrollRef: RefObject<HTMLElement | null>, count: number): {
  anchorRef: RefObject<HTMLDivElement | null>;
  start: number;
  end: number;
} {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState(() => ({ start: 0, end: Math.min(count, WINDOW_OVERSCAN * 2) }));

  useEffect(() => {
    const parent = scrollRef.current;
    const anchor = anchorRef.current;
    if (!parent || !anchor || count === 0) return;
    let neighbors = 0;
    const measure = () => {
      const parentRect = parent.getBoundingClientRect();
      const top = parent.scrollTop + (anchor.getBoundingClientRect().top - parentRect.top);
      const viewStart = parent.scrollTop - WINDOW_OVERSCAN * ROW_HEIGHT;
      const viewEnd = parent.scrollTop + parent.clientHeight + (WINDOW_OVERSCAN + neighbors) * ROW_HEIGHT;
      let start = Math.floor((viewStart - top) / ROW_HEIGHT);
      let end = Math.ceil((viewEnd - top) / ROW_HEIGHT);
      if (start < 0) start = 0;
      if (end > count) end = count;
      if (end < start) end = start;
      setRange((previous) => (previous.start === start && previous.end === end ? previous : { start, end }));
    };
    measure();
    parent.addEventListener("scroll", measure, { passive: true });
    const cancelIdle = scheduleIdle(() => {
      neighbors = IDLE_NEIGHBORS;
      measure();
    });
    return () => {
      parent.removeEventListener("scroll", measure);
      cancelIdle();
    };
  }, [scrollRef, count]);

  const start = Math.min(range.start, count);
  const end = Math.min(Math.max(range.end, start), count);
  return { anchorRef, start, end };
}

function DirectoryList({
  path,
  root,
  depth,
  sessionId,
  expanded,
  gitByPath,
  scrollRef,
  onToggle,
  onOpen,
  ops,
  onRenamed,
  onDeleted,
  onDragStartFile,
}: DirectoryListProps) {
  const query = useFileList(path, sessionId);
  const entries = query.data?.entries ?? [];
  const ready = !query.isLoading && !query.isError;
  const count = ready ? Math.min(entries.length, MAX_ENTRIES) : 0;
  const { anchorRef, start, end } = useEntryWindow(scrollRef, count);
  if (query.isLoading) return <div className={styles.treeStatus}>Loading…</div>;
  if (query.isError) return <div className={styles.treeError}>{query.error.message}</div>;
  if (entries.length === 0) return <div className={styles.treeStatus}>empty</div>;
  const visible = entries.slice(start, end);

  return (
    <div ref={anchorRef}>
      {start > 0 ? <div style={{ height: start * ROW_HEIGHT }} /> : null}
      {visible.map((entry) => {
        const fullPath = joinPath(path, entry.name);
        if (entry.isDir) {
          const open = expanded.includes(fullPath);
          return (
            <DirectoryBranch
              key={fullPath}
              fullPath={fullPath}
              name={entry.name}
              root={root}
              open={open}
              depth={depth}
              sessionId={sessionId}
              expanded={expanded}
              gitByPath={gitByPath}
              scrollRef={scrollRef}
              onToggle={onToggle}
              onOpen={onOpen}
              ops={ops}
              {...(onRenamed ? { onRenamed } : {})}
              {...(onDeleted ? { onDeleted } : {})}
              {...(onDragStartFile ? { onDragStartFile } : {})}
            />
          );
        }
        const status = gitByPath.get(comparablePath(fullPath));
        return (
          <TreeRow
            key={fullPath}
            fullPath={fullPath}
            name={entry.name}
            root={root}
            isDir={false}
            depth={depth}
            onToggle={onToggle}
            onOpen={onOpen}
            ops={ops}
            {...(status ? { status } : {})}
            {...(onRenamed ? { onRenamed } : {})}
            {...(onDeleted ? { onDeleted } : {})}
            {...(onDragStartFile ? { onDragStartFile } : {})}
          />
        );
      })}
      {end < count ? <div style={{ height: (count - end) * ROW_HEIGHT }} /> : null}
      {entries.length > MAX_ENTRIES ? (
        <div className={styles.treeStatus}>Showing first {MAX_ENTRIES} of {entries.length}</div>
      ) : null}
    </div>
  );
}

function DirectoryBranch(props: {
  fullPath: string;
  name: string;
  root: string;
  open: boolean;
  depth: number;
  sessionId: string;
  expanded: readonly string[];
  gitByPath: Map<string, GitFileStatus>;
  scrollRef: RefObject<HTMLDivElement | null>;
  onToggle: (path: string) => void;
  onOpen: (path: string, preview: boolean) => void;
  ops: TreeOps;
  onRenamed?: (from: string, to: string) => void;
  onDeleted?: (path: string) => void;
  onDragStartFile?: (event: DragEvent<HTMLDivElement>, path: string, root: string) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const { scrollRef, open, fullPath } = props;

  useEffect(() => {
    const node = rowRef.current;
    const parent = scrollRef.current;
    if (!node || seen || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((observed) => {
      if (observed.some((entry) => entry.isIntersecting)) setSeen(true);
    }, { root: parent, rootMargin: "160px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [scrollRef, seen]);

  return (
    <Fragment>
      <TreeRow
        rowRef={rowRef}
        fullPath={fullPath}
        name={props.name}
        root={props.root}
        isDir
        open={open}
        depth={props.depth}
        onToggle={(path) => {
          setSeen(true);
          props.onToggle(path);
        }}
        onOpen={props.onOpen}
        ops={props.ops}
        {...(props.onRenamed ? { onRenamed: props.onRenamed } : {})}
        {...(props.onDeleted ? { onDeleted: props.onDeleted } : {})}
        {...(props.onDragStartFile ? { onDragStartFile: props.onDragStartFile } : {})}
      />
      {open && seen ? (
        <DirectoryList
          path={fullPath}
          root={props.root}
          depth={props.depth + 1}
          sessionId={props.sessionId}
          expanded={props.expanded}
          gitByPath={props.gitByPath}
          scrollRef={scrollRef}
          onToggle={props.onToggle}
          onOpen={props.onOpen}
          ops={props.ops}
          {...(props.onRenamed ? { onRenamed: props.onRenamed } : {})}
          {...(props.onDeleted ? { onDeleted: props.onDeleted } : {})}
          {...(props.onDragStartFile ? { onDragStartFile: props.onDragStartFile } : {})}
        />
      ) : null}
    </Fragment>
  );
}

type RowMode = "idle" | "rename" | "confirm";

interface TreeRowProps {
  fullPath: string;
  name: string;
  root: string;
  isDir: boolean;
  open?: boolean;
  status?: GitFileStatus;
  depth: number;
  rowRef?: Ref<HTMLDivElement>;
  onToggle: (path: string) => void;
  onOpen: (path: string, preview: boolean) => void;
  ops: TreeOps;
  onRenamed?: (from: string, to: string) => void;
  onDeleted?: (path: string) => void;
  onDragStartFile?: (event: DragEvent<HTMLDivElement>, path: string, root: string) => void;
}

function TreeRow({
  fullPath,
  name,
  root,
  isDir,
  open = false,
  status,
  depth,
  rowRef,
  onToggle,
  onOpen,
  ops,
  onRenamed,
  onDeleted,
  onDragStartFile,
}: TreeRowProps) {
  const [mode, setMode] = useState<RowMode>("idle");
  const [draftName, setDraftName] = useState(name);
  const [busy, setBusy] = useState(false);
  const indent = { paddingLeft: 6 + depth * 12 };

  const startRename = () => {
    setDraftName(name);
    setMode("rename");
  };

  const submitRename = async () => {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === name) {
      setMode("idle");
      return;
    }
    const target = joinPath(dirname(fullPath), trimmed);
    setBusy(true);
    const ok = await ops.rename(fullPath, target);
    setBusy(false);
    if (ok) {
      onRenamed?.(fullPath, target);
      setMode("idle");
    }
  };

  const submitDelete = async () => {
    setBusy(true);
    const ok = await ops.remove(fullPath, isDir);
    setBusy(false);
    if (ok) {
      onDeleted?.(fullPath);
      setMode("idle");
    }
  };

  if (mode === "rename") {
    return (
      <div ref={rowRef} className={styles.treeRow} style={indent}>
        <input
          className={styles.inlineInput}
          value={draftName}
          autoFocus
          disabled={busy}
          aria-label={`Rename ${name}`}
          onChange={(event) => setDraftName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submitRename();
            } else if (event.key === "Escape") {
              setMode("idle");
            }
          }}
        />
        <button className={styles.inlineButton} onClick={() => void submitRename()} disabled={busy}>✓</button>
        <button className={styles.inlineButton} onClick={() => setMode("idle")} disabled={busy}>×</button>
      </div>
    );
  }

  if (mode === "confirm") {
    return (
      <div ref={rowRef} className={`${styles.treeRow} ${styles.confirmRow}`} style={indent}>
        <span className={styles.confirmText} title={fullPath}>
          Delete {name}{isDir ? " (directory)" : ""}?
        </span>
        <button className={styles.inlineButton} onClick={() => void submitDelete()} disabled={busy}>Delete</button>
        <button className={styles.inlineButton} onClick={() => setMode("idle")} disabled={busy}>Cancel</button>
      </div>
    );
  }

  return (
    <div
      ref={rowRef}
      className={styles.treeRow}
      style={indent}
      draggable={!isDir}
      onDragStart={isDir ? undefined : (event) => onDragStartFile?.(event, fullPath, root)}
    >
      <button
        className={styles.treeMain}
        onClick={() => (isDir ? onToggle(fullPath) : onOpen(fullPath, true))}
        onDoubleClick={() => {
          if (!isDir) onOpen(fullPath, false);
        }}
        title={status ? `${fullPath} (${status.status})` : fullPath}
      >
        <span className={isDir ? styles.treeChevron : styles.treeFileMark}>{isDir ? (open ? "▾" : "▸") : "·"}</span>
        <span className={styles.treeName}>{name}</span>
        {status ? <span className={`${styles.badge} ${badgeClass(status)}`}>{status.code}</span> : null}
      </button>
      <span className={styles.treeActions}>
        <button className={styles.rowAction} onClick={startRename} title={`Rename ${name}`}>✎</button>
        <button className={styles.rowAction} onClick={() => setMode("confirm")} title={`Delete ${name}`}>×</button>
      </span>
    </div>
  );
}
