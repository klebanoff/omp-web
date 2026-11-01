import { useSyncExternalStore } from "react";
import { basename, comparablePath } from "@/api/paths";
import type { ProjectSummary, SessionSummary } from "@/api/workspace";

/**
 * The session list is polled on the rail. Other columns read a published
 * snapshot and re-render only when the value they return changes.
 */

let sessions: readonly SessionSummary[] = [];
let projects: readonly ProjectSummary[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishSessionCatalog(
  nextSessions: readonly SessionSummary[],
  nextProjects: readonly ProjectSummary[],
): void {
  if (nextSessions === sessions && nextProjects === projects) return;
  sessions = nextSessions;
  projects = nextProjects;
  emit();
}

export function catalogSession(sessionId: string | null): SessionSummary | null {
  if (!sessionId) return null;
  return sessions.find((item) => item.id === sessionId) ?? null;
}

export function catalogProjects(): readonly ProjectSummary[] {
  return projects;
}

export function useCatalogProjects(): readonly ProjectSummary[] {
  return useSyncExternalStore(subscribe, catalogProjects, catalogProjects);
}

export function useListedSession(sessionId: string | null): SessionSummary | null {
  return useSyncExternalStore(
    subscribe,
    () => catalogSession(sessionId),
    () => null,
  );
}

interface SessionPaths {
  root: string | null;
  projectRoot: string | null;
  label: string;
}

const EMPTY_PATHS: SessionPaths = { root: null, projectRoot: null, label: "" };
let pathCacheKey = "";
let pathCache: SessionPaths = EMPTY_PATHS;

function pathsFor(sessionId: string | null): SessionPaths {
  const session = catalogSession(sessionId);
  const root = session?.cwd ?? null;
  const projectRoot = session?.projectRoot ?? root;
  const match = projectRoot
    ? projects.find((project) => comparablePath(project.path) === comparablePath(projectRoot))
    : undefined;
  const label = match?.alias?.trim() || (projectRoot ? basename(projectRoot) : "");
  const key = `${sessionId ?? ""}\0${root ?? ""}\0${projectRoot ?? ""}\0${label}`;
  if (key === pathCacheKey) return pathCache;
  pathCacheKey = key;
  pathCache = root === null && projectRoot === null && label === ""
    ? EMPTY_PATHS
    : { root, projectRoot, label };
  return pathCache;
}

export function useSessionPaths(sessionId: string | null): SessionPaths {
  return useSyncExternalStore(subscribe, () => pathsFor(sessionId), () => EMPTY_PATHS);
}
