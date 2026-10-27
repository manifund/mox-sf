import pino from "pino";

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "mox-support-bot" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof log;
