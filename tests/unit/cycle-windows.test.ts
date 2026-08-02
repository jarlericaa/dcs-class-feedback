import { describe, expect, it } from "vitest";
import { computeCycleWindows } from "@/modules/forms/cycles";
import { zonedTimeToUtc } from "@/modules/forms/timezone";

const TZ = "Asia/Manila";

// Open Monday 08:00, deadline Friday 17:00, starting Mon 2026-01-05.
const base = {
  openDayOfWeek: 1,
  openTime: "08:00:00",
  deadlineDayOfWeek: 5,
  deadlineTime: "17:00:00",
  startDate: "2026-01-05",
  endDate: null as string | null,
  occurrenceCount: null as number | null,
  timezone: TZ,
};

describe("computeCycleWindows", () => {
  it("generates weekly windows in the institution timezone", () => {
    const horizon = zonedTimeToUtc(2026, 1, 20, 0, 0, 0, TZ);
    const windows = computeCycleWindows(base, horizon);
    expect(windows).toHaveLength(3); // Jan 5, 12, 19
    expect(windows[0]!.openAt).toEqual(
      zonedTimeToUtc(2026, 1, 5, 8, 0, 0, TZ),
    );
    expect(windows[0]!.deadlineAt).toEqual(
      zonedTimeToUtc(2026, 1, 9, 17, 0, 0, TZ),
    );
    expect(windows[1]!.cycleIndex).toBe(2);
    expect(windows[1]!.openAt).toEqual(
      zonedTimeToUtc(2026, 1, 12, 8, 0, 0, TZ),
    );
  });

  it("snaps the first occurrence forward to the open weekday", () => {
    // start on a Wednesday; first Monday open is Jan 12
    const windows = computeCycleWindows(
      { ...base, startDate: "2026-01-07" },
      zonedTimeToUtc(2026, 1, 13, 0, 0, 0, TZ),
    );
    expect(windows[0]!.openAt).toEqual(
      zonedTimeToUtc(2026, 1, 12, 8, 0, 0, TZ),
    );
  });

  it("respects occurrenceCount", () => {
    const windows = computeCycleWindows(
      { ...base, occurrenceCount: 2 },
      zonedTimeToUtc(2026, 6, 1, 0, 0, 0, TZ),
    );
    expect(windows).toHaveLength(2);
  });

  it("respects endDate", () => {
    const windows = computeCycleWindows(
      { ...base, endDate: "2026-01-12" },
      zonedTimeToUtc(2026, 6, 1, 0, 0, 0, TZ),
    );
    expect(windows).toHaveLength(2); // Jan 5 and Jan 12 open dates only
  });

  it("wraps the deadline to next week when deadline weekday equals open weekday at an earlier time", () => {
    const windows = computeCycleWindows(
      {
        ...base,
        deadlineDayOfWeek: 1,
        deadlineTime: "07:00:00", // before 08:00 open → next Monday
      },
      zonedTimeToUtc(2026, 1, 6, 0, 0, 0, TZ),
    );
    expect(windows[0]!.deadlineAt).toEqual(
      zonedTimeToUtc(2026, 1, 12, 7, 0, 0, TZ),
    );
  });

  it("same-day deadline allowed when strictly after the open time", () => {
    const windows = computeCycleWindows(
      { ...base, deadlineDayOfWeek: 1, deadlineTime: "20:00:00" },
      zonedTimeToUtc(2026, 1, 6, 0, 0, 0, TZ),
    );
    expect(windows[0]!.deadlineAt).toEqual(
      zonedTimeToUtc(2026, 1, 5, 20, 0, 0, TZ),
    );
    expect(windows[0]!.openAt < windows[0]!.deadlineAt).toBe(true);
  });
});
