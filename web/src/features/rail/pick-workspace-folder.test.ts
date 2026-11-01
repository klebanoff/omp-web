import { afterEach, describe, expect, it, vi } from "vitest";
import { pickBrowserFolder } from "./pick-workspace-folder";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pickBrowserFolder", () => {
  it("returns null when the browser dialog is cancelled", async () => {
    vi.stubGlobal(
      "showDirectoryPicker",
      () => Promise.reject(new DOMException("The user aborted a request.", "AbortError")),
    );

    await expect(pickBrowserFolder()).resolves.toBeNull();
  });

  it("uses a path the browser attached to the chosen folder", async () => {
    vi.stubGlobal("showDirectoryPicker", () => Promise.resolve({
      name: "omp-web",
      path: "D:\\Work\\omp-web",
      values: async function* values() {},
    }));

    await expect(pickBrowserFolder()).resolves.toBe("D:\\Work\\omp-web");
  });
});
