/** The standing queue — one pinned message, edited in place, debounced (§9.4). */
import { EmbedBuilder } from "discord.js";
import type { App } from "./app.js";
import { fetchMessage, fetchSendable, isKnownInaccessible, warnInaccessibleOnce } from "./discord.js";
import { standingQueue } from "./render.js";
import { localParts } from "./util/time.js";

const KV_KEY = "standing_queue_message_id";

export class StandingQueue {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private pending = false;

  constructor(private readonly app: () => App) {}

  /** Debounced rebuild — a burst of activity results in one edit. */
  schedule(): void {
    const app = this.app();
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.rebuild();
    }, app.cfg.standing_queue.debounce_seconds * 1000);
  }

  private startOfTodayIso(): string {
    const app = this.app();
    const lp = localParts(new Date(), app.cfg.claudio_hours.tz);
    // midnight local, expressed by walking back from now
    const now = new Date();
    const back = lp.minutesOfDay * 60000 + now.getSeconds() * 1000;
    return new Date(now.getTime() - back).toISOString();
  }

  build(): EmbedBuilder {
    const app = this.app();
    const open = app.db.listOpen();
    const closedToday = app.db.countClosedSince(this.startOfTodayIso());
    const ideas = app.db.listLogged().length;
    const text = standingQueue(app.cfg, open, closedToday, ideas, app.cfg.standing_queue.max_rows);
    return new EmbedBuilder().setDescription(text).setColor(0x2b2d31);
  }

  async rebuild(): Promise<void> {
    if (this.running) {
      this.pending = true;
      return;
    }
    this.running = true;
    const app = this.app();
    try {
      const channelId = app.cfg.standing_queue.channel_id;
      if (isKnownInaccessible(channelId)) return;
      const embed = this.build();
      const existingId = app.db.kvGet(KV_KEY);
      if (existingId) {
        const msg = await fetchMessage(app.client, channelId, existingId);
        if (msg) {
          await msg.edit({ embeds: [embed], content: "", allowedMentions: { parse: [] } });
          return;
        }
        app.db.kvDel(KV_KEY);
      }
      const ch = await fetchSendable(app.client, channelId);
      if (!ch) {
        warnInaccessibleOnce(channelId, "standing queue");
        return;
      }
      const msg = await ch.send({ embeds: [embed], allowedMentions: { parse: [] } });
      app.db.kvSet(KV_KEY, msg.id);
      try {
        await msg.pin();
      } catch (err) {
        app.log.warn({ err }, "could not pin the standing queue (needs Manage Messages)");
      }
    } catch (err) {
      app.log.error({ err }, "standing queue rebuild failed");
    } finally {
      this.running = false;
      if (this.pending) {
        this.pending = false;
        this.schedule();
      }
    }
  }
}
