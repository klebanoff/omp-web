import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectSummary, SessionSummary } from "@/api/workspace";
import { RailSkin } from "./RailSkin";

afterEach(cleanup);

const projects = [
  { path: "/projects/games", alias: "Games" },
] as unknown as ProjectSummary[];

function renderRail(onNewSession: (projectPath?: string) => void) {
  render(
    <RailSkin
      sessions={[]}
      projects={projects}
      selected={null}
      running={new Set()}
      hideInactiveAfterDays={0}
      loading={false}
      error={null}
      onSelect={() => {}}
      onNewSession={onNewSession}
      onRefresh={() => {}}
      onCollapse={() => {}}
      onOpenSettings={() => {}}
      onAddWorkspace={() => {}}
    />,
  );
}

describe("rail new session entry point", () => {
  it("creates from a project header with that root", () => {
    const onNewSession = vi.fn();
    renderRail(onNewSession);

    fireEvent.click(screen.getByRole("button", { name: "New session in Games" }));

    expect(onNewSession).toHaveBeenCalledWith("/projects/games");
  });

  it("offers a workspace folder button beside search", () => {
    const onToggleWorkspacePicker = vi.fn();
    render(
      <RailSkin
        sessions={[]}
        projects={projects}
        selected={null}
        running={new Set()}
        hideInactiveAfterDays={0}
        loading={false}
        error={null}
        onSelect={() => {}}
        onNewSession={() => {}}
        onRefresh={() => {}}
        onCollapse={() => {}}
        onOpenSettings={() => {}}
        onAddWorkspace={onToggleWorkspacePicker}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add workspace folder" }));

    expect(onToggleWorkspacePicker).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Search sessions" })).toBeTruthy();
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;

function quietSession(id: string, ageDays: number): SessionSummary {
  const stamp = new Date(Date.now() - ageDays * DAY_MS).toISOString();
  return {
    id,
    path: `/sessions/${id}.jsonl`,
    cwd: "/projects/games",
    projectRoot: "/projects/games",
    created: stamp,
    modified: stamp,
    messageCount: 1,
    firstMessage: "",
    name: id,
  } as unknown as SessionSummary;
}

function renderQuietRail(hideInactiveAfterDays: number) {
  render(
    <RailSkin
      sessions={[quietSession("quiet", 30)]}
      projects={projects}
      selected={null}
      running={new Set()}
      hideInactiveAfterDays={hideInactiveAfterDays}
      loading={false}
      error={null}
      onSelect={() => {}}
      onNewSession={() => {}}
      onRefresh={() => {}}
      onCollapse={() => {}}
      onOpenSettings={() => {}}
      onAddWorkspace={() => {}}
    />,
  );
}

describe("rail older conversations", () => {
  it("folds a quiet conversation into a collapsed Older row and opens it on click", () => {
    renderQuietRail(7);

    expect(screen.queryByRole("button", { name: /quiet/ })).toBeNull();
    const older = screen.getByRole("button", { name: /Older/ });
    expect(older.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(older);

    expect(older.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: /quiet/ })).toBeTruthy();
  });

  it("lists everything when the threshold is never", () => {
    renderQuietRail(0);

    expect(screen.getByRole("button", { name: /quiet/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Older/ })).toBeNull();
  });
});
