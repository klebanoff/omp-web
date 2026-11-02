import { useEffect, useMemo, useRef, useState } from "react";
import { buildRailView, type RailSessionItem } from "@/features/rail/rail-view";
import type { RailSlotProps } from "@/slots/rail";
import {
  ChevronIcon,
  FilterIcon,
  FolderIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SidebarIcon,
  XIcon,
} from "./icons";
import styles from "./rail.module.css";

export function RailSkin({
  sessions,
  projects,
  selected,
  running,
  hideInactiveAfterDays,
  loading,
  error,
  onSelect,
  onNewSession,
  onCollapse,
  onOpenSettings,
  onAddWorkspace,
}: RailSlotProps) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [runningOnly, setRunningOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [olderOpen, setOlderOpen] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const restoreSearchFocus = useRef(false);

  useEffect(() => {
    if (searchOpen) {
      searchRef.current?.focus();
    } else if (restoreSearchFocus.current) {
      restoreSearchFocus.current = false;
      searchToggleRef.current?.focus();
    }
  }, [searchOpen]);

  const view = useMemo(
    () =>
      buildRailView({
        sessions,
        projects,
        running,
        query,
        runningOnly,
        inactiveAfterDays: hideInactiveAfterDays,
        selectedId: selected,
      }),
    [sessions, projects, running, query, runningOnly, hideInactiveAfterDays, selected],
  );

  const toggleGroup = (key: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleOlder = (key: string) => {
    setOlderOpen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const closeSearch = () => {
    restoreSearchFocus.current = true;
    setSearchOpen(false);
    setQuery("");
  };

  const renderSession = (item: RailSessionItem) => {
    const active = item.id === selected;
    return (
      <button
        key={item.id}
        type="button"
        className={active ? `${styles.session} ${styles.sessionActive}` : styles.session}
        onClick={() => onSelect(item.id)}
        title={item.time ? `${item.cwd} · ${item.time}` : item.cwd}
        aria-current={active ? "page" : undefined}
      >
        <span className={styles.dotSlot} aria-hidden="true">
          {item.running ? <span className={styles.dotRunning} /> : null}
        </span>
        <span className={styles.sessionName}>{item.label}</span>
        {item.projectLabel ? <span className={styles.sessionProject}>{item.projectLabel}</span> : null}
        <span className={styles.sessionMeta}>{item.time}</span>
      </button>
    );
  };

  const empty = !loading && !error && view.active.length === 0 && view.groups.length === 0;

  return (
    <aside className={styles.rail}>
      <header className={styles.header}>
        <span className={styles.brandName}>omp</span>
        {searchOpen ? (
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>
              <SearchIcon size={13} />
            </span>
            <input
              ref={searchRef}
              className={styles.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") closeSearch();
              }}
              placeholder="Filter sessions"
              aria-label="Search sessions"
              spellCheck={false}
            />
            <button
              type="button"
              className={styles.searchClose}
              onClick={closeSearch}
              title="Close search"
              aria-label="Close search"
            >
              <XIcon size={13} />
            </button>
          </div>
        ) : null}
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onAddWorkspace}
            title="Add workspace folder"
            aria-label="Add workspace folder"
          >
            <FolderIcon size={15} />
          </button>
          {searchOpen ? null : (
            <button
              ref={searchToggleRef}
              type="button"
              className={styles.iconButton}
              onClick={() => setSearchOpen(true)}
              title="Search sessions"
              aria-label="Search sessions"
            >
              <SearchIcon size={15} />
            </button>
          )}
          {searchOpen ? null : (
            <button
              type="button"
              className={runningOnly ? `${styles.iconButton} ${styles.iconButtonActive}` : styles.iconButton}
              onClick={() => setRunningOnly((value) => !value)}
              title={runningOnly ? "Show all sessions" : "Show running sessions only"}
              aria-label={runningOnly ? "Show all sessions" : "Show running sessions only"}
              aria-pressed={runningOnly}
            >
              <FilterIcon size={15} />
            </button>
          )}
          <button
            type="button"
            className={styles.iconButton}
            onClick={onCollapse}
            title="Hide session rail"
            aria-label="Hide session rail"
          >
            <SidebarIcon size={15} />
          </button>
        </div>
      </header>

      <div className={styles.scroll}>
        {error ? <p className={styles.error}>{error}</p> : null}
        {loading && sessions.length === 0 ? <p className={styles.muted}>Loading sessions…</p> : null}

        {view.active.length > 0 ? (
          <section className={styles.section}>
            <div className={styles.sectionLabelRow}>
              <span className={styles.sectionLabel}>Active</span>
              <span className={styles.sectionCount}>{view.active.length}</span>
            </div>
            {view.active.map(renderSession)}
          </section>
        ) : null}

        {view.groups.map((group) => {
          const isCollapsed = collapsed.has(group.key);
          const isOlderOpen = olderOpen.has(group.key);
          return (
            <section key={group.key} className={styles.section}>
              <div className={styles.groupHeaderRow}>
                <button
                  type="button"
                  className={styles.groupHeader}
                  onClick={() => toggleGroup(group.key)}
                  title={group.path}
                  aria-expanded={!isCollapsed}
                >
                  <span className={isCollapsed ? `${styles.chevron} ${styles.chevronCollapsed}` : styles.chevron}>
                    <ChevronIcon size={12} />
                  </span>
                  <span className={styles.groupIcon}>
                    <FolderIcon size={14} />
                  </span>
                  <span className={styles.groupLabel}>{group.label}</span>
                  {group.sessions.length > 0 ? (
                    <span className={styles.groupCount}>{group.sessions.length}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className={styles.groupAdd}
                  onClick={() => onNewSession(group.path)}
                  title={`New session in ${group.label}`}
                  aria-label={`New session in ${group.label}`}
                >
                  <PlusIcon size={13} />
                </button>
              </div>
              {isCollapsed ? null : (
                <div className={styles.groupSessions}>
                  {group.sessions.map(renderSession)}
                  {group.older.length > 0 ? (
                    <div className={styles.older}>
                      <button
                        type="button"
                        className={styles.olderRow}
                        onClick={() => toggleOlder(group.key)}
                        title={
                          hideInactiveAfterDays > 0
                            ? `No activity for over ${hideInactiveAfterDays} ${hideInactiveAfterDays === 1 ? "day" : "days"}`
                            : undefined
                        }
                        aria-expanded={isOlderOpen}
                      >
                        <span
                          className={
                            isOlderOpen
                              ? `${styles.olderChevron} ${styles.olderChevronOpen}`
                              : styles.olderChevron
                          }
                        >
                          <ChevronIcon size={11} />
                        </span>
                        <span className={styles.olderLabel}>Older</span>
                        <span className={styles.olderCount}>{group.older.length}</span>
                      </button>
                      {isOlderOpen ? group.older.map(renderSession) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          );
        })}

        {empty ? (
          <p className={styles.muted}>
            {runningOnly ? "No running sessions" : query.trim() ? "No matching sessions" : "No sessions"}
          </p>
        ) : null}
      </div>

      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.footerButton}
          onClick={onOpenSettings}
          title="System settings (Ctrl/Cmd+,)"
          aria-label="System settings"
        >
          <SettingsIcon size={15} />
          <span>Settings</span>
        </button>
      </footer>
    </aside>
  );
}
