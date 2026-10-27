import { loadConfig } from "../src/config.js";

export const cfg = loadConfig("config.yaml");

/** A Date at the given America/Los_Angeles wall-clock time on 2026-09-22 (PDT, UTC-7). */
export function la(hhmm: string, day = "2026-09-22"): Date {
  return new Date(`${day}T${hhmm}:00-07:00`);
}
