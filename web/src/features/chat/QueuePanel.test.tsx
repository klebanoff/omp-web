import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueuePanel } from "./QueuePanel";
import { testQueueClasses } from "./test-classes";

afterEach(cleanup);

describe("QueuePanel", () => {
  it("renders nothing when both queues are empty", () => {
    const { container } = render(
      <QueuePanel classes={testQueueClasses} queue={{ steering: [], followUp: [] }} onRemove={vi.fn()} onPromote={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("removes steering and follow-up entries with their queue", () => {
    const onRemove = vi.fn();
    render(
      <QueuePanel classes={testQueueClasses}
        queue={{ steering: ["steer me"], followUp: ["later"] }}
        onRemove={onRemove}
        onPromote={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove steer me" }));
    expect(onRemove).toHaveBeenCalledWith("steering", "steer me");

    fireEvent.click(screen.getByRole("button", { name: "Remove later" }));
    expect(onRemove).toHaveBeenCalledWith("followUp", "later");
  });

  it("promotes a follow-up to steering", () => {
    const onPromote = vi.fn();
    render(
      <QueuePanel classes={testQueueClasses} queue={{ steering: [], followUp: ["later"] }} onRemove={vi.fn()} onPromote={onPromote} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Steer later" }));
    expect(onPromote).toHaveBeenCalledWith("later");
  });

  it("disables every action while pending", () => {
    render(
      <QueuePanel classes={testQueueClasses}
        queue={{ steering: ["a"], followUp: ["b"] }}
        pending
        onRemove={vi.fn()}
        onPromote={vi.fn()}
      />,
    );
    for (const button of screen.getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
