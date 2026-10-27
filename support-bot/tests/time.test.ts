import { describe, expect, it } from "vitest";
import { inWindow, isInsideHours, localParts, staffedMinutesBetween } from "../src/util/time.js";
import { cfg, la } from "./helpers.js";

describe("time helpers", () => {
  it("localParts reads LA wall-clock", () => {
    const lp = localParts(la("00:00"), "America/Los_Angeles");
    expect(lp.hour).toBe(0);
    expect(lp.minutesOfDay).toBe(0);
    expect(lp.dayKey).toBe("tue");
  });
  it("inWindow is half-open and wraps midnight", () => {
    expect(inWindow(16 * 60 + 59, "00:00", "17:00")).toBe(true);
    expect(inWindow(17 * 60, "00:00", "17:00")).toBe(false);
    expect(inWindow(0, "00:00", "17:00")).toBe(true);
    expect(inWindow(23 * 60, "17:00", "05:00")).toBe(true);
    expect(inWindow(6 * 60, "17:00", "05:00")).toBe(false);
  });
  it("isInsideHours honours the configured claudio window", () => {
    expect(isInsideHours(la("16:59"), cfg.claudio_hours)).toBe(true);
    expect(isInsideHours(la("17:00"), cfg.claudio_hours)).toBe(false);
  });
  it("staffed minutes: a P1 filed at 16:00 has only 1h staffed by 20:00, 4h by 08:00 next morning (E12)", () => {
    const filed = la("16:00");
    expect(staffedMinutesBetween(filed, la("20:00"), cfg.staffed_hours)).toBe(60);
    expect(staffedMinutesBetween(filed, la("08:00", "2026-09-23"), cfg.staffed_hours)).toBe(240);
    expect(staffedMinutesBetween(filed, la("07:50", "2026-09-23"), cfg.staffed_hours)).toBeLessThan(240);
  });
});
