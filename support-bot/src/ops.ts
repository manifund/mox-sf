/** Ops alerts — DMs to Jen, rate-limited to one per type per hour (§9.2). */
import type { Client } from "discord.js";
import type { Db } from "./db.js";
import { log } from "./log.js";

export class OpsAlerts {
  constructor(
    private readonly client: Client,
    private readonly db: Db,
    private readonly userId: string,
    private readonly perHour = 1,
  ) {}

  async send(type: string, text: string, force = false): Promise<void> {
    const key = `ops:last:${type}`;
    const last = this.db.kvGet(key);
    const minGapMs = (60 * 60 * 1000) / this.perHour;
    if (!force && last && Date.now() - new Date(last).getTime() < minGapMs) {
      log.debug({ type }, "ops alert suppressed (rate limit)");
      return;
    }
    this.db.kvSet(key, new Date().toISOString());
    try {
      const user = await this.client.users.fetch(this.userId);
      await user.send(`🛠️ ${text}`);
      log.warn({ type, text }, "ops alert sent");
    } catch (err) {
      log.error({ err, type, text }, "ops alert DM failed");
    }
  }
}
