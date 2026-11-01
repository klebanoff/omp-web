import { describe, expect, it } from "vitest";
import {
  anchorRestoredScrollTop,
  distanceFromBottom,
  isNearBottom,
  OLDER_TRIGGER_PX,
  shouldLoadOlder,
  STICK_SLACK_PX,
} from "./transcript-scroll";

const metrics = (scrollTop: number, scrollHeight = 1000, clientHeight = 400) => ({
  scrollTop,
  scrollHeight,
  clientHeight,
});

describe("tail sticking", () => {
  it("measures the remaining distance below the viewport", () => {
    expect(distanceFromBottom(metrics(600))).toBe(0);
    expect(distanceFromBottom(metrics(560))).toBe(40);
  });

  it("counts anything within the slack as following the tail", () => {
    expect(isNearBottom(metrics(600))).toBe(true);
    expect(isNearBottom(metrics(600 - STICK_SLACK_PX + 1))).toBe(true);
    expect(isNearBottom(metrics(600 - STICK_SLACK_PX))).toBe(false);
    expect(isNearBottom(metrics(560), 30)).toBe(false);
  });
});

describe("older history requests", () => {
  it("asks only at the top, with older pages, and no pending anchor", () => {
    expect(shouldLoadOlder(metrics(0), true, false)).toBe(true);
    expect(shouldLoadOlder(metrics(OLDER_TRIGGER_PX - 1), true, false)).toBe(true);
    expect(shouldLoadOlder(metrics(OLDER_TRIGGER_PX), true, false)).toBe(false);
    expect(shouldLoadOlder(metrics(0), false, false)).toBe(false);
    expect(shouldLoadOlder(metrics(0), true, true)).toBe(false);
  });
});

describe("history anchor", () => {
  it("keeps the previous top row in place after a prepend", () => {
    const prepared = metrics(12, 2400, 400);
    expect(anchorRestoredScrollTop(prepared, 1000)).toBe(1412);
  });

  it("is a no-op when the content height did not change", () => {
    expect(anchorRestoredScrollTop(metrics(40), 1000)).toBe(40);
  });
});
