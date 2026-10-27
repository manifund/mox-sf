/** The one bag of shared services every handler and job receives. */
import type { Client } from "discord.js";
import type { Config, Env } from "./config.js";
import type { Db } from "./db.js";
import type { Logger } from "./log.js";
import type { AirtableMirror } from "./airtable.js";
import type { OpsAlerts } from "./ops.js";
import type { TriageService } from "./triage/index.js";
import type { TriageAI } from "./triage/ai.js";
import type { StandingQueue } from "./queue.js";
import type { PinnedPost } from "./pinnedPost.js";

export interface App {
  cfg: Config;
  env: Env;
  db: Db;
  client: Client<true>;
  log: Logger;
  triage: TriageService;
  ai: TriageAI | null;
  mirror: AirtableMirror;
  ops: OpsAlerts;
  queue: StandingQueue;
  pinnedPost: PinnedPost;
  version: string;
  startedAt: Date;
}
