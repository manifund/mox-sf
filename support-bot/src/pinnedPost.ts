/** The two channel messages: a member-POV intro, then the button post (§6.1). Posted once, re-edited on boot, moved if the channel changes. */
import type { App } from "./app.js";
import { fetchMessage, fetchSendable, warnInaccessibleOnce } from "./discord.js";
import { introPost, pinnedPost } from "./render.js";

const KV_KEY = "pinned_post_message_id";
const KV_INTRO = "intro_post_message_id";
const KV_CHANNEL = "pinned_post_channel_id";

export class PinnedPost {
  constructor(private readonly app: () => App) {}

  async ensure(): Promise<void> {
    const app = this.app();
    const channelId = app.cfg.channels.report_an_issue;
    const existing = app.db.kvGet(KV_KEY);
    const existingIntro = app.db.kvGet(KV_INTRO);
    const existingChannel = app.db.kvGet(KV_CHANNEL);

    if (existingChannel && existingChannel !== channelId) {
      // the intake moved: take down the old front door so there is exactly one
      for (const id of [existingIntro, existing]) {
        if (!id) continue;
        const old = await fetchMessage(app.client, existingChannel, id);
        if (old) await old.delete().catch((err) => app.log.warn({ err }, "could not delete an old intake post"));
      }
      app.db.kvDel(KV_KEY);
      app.db.kvDel(KV_INTRO);
      app.db.kvDel(KV_CHANNEL);
      app.log.info({ from: existingChannel, to: channelId }, "intake channel changed — old posts removed");
      return this.ensure();
    }

    const ch = await fetchSendable(app.client, channelId);
    if (!ch) return void warnInaccessibleOnce(channelId, "intake posts");

    // intro first, so it sits above the button
    let introOk = false;
    if (existingIntro) {
      const msg = await fetchMessage(app.client, channelId, existingIntro);
      if (msg) {
        await msg.edit({ ...introPost(app.cfg), allowedMentions: { parse: [] } }).catch(() => undefined);
        introOk = true;
      } else app.db.kvDel(KV_INTRO);
    }
    if (!introOk) {
      // a new intro must sit above the button post: drop the old button so the order is intro, then button
      if (existing) {
        const oldBtn = await fetchMessage(app.client, channelId, existing);
        if (oldBtn) await oldBtn.delete().catch(() => undefined);
        app.db.kvDel(KV_KEY);
      }
      const intro = await ch.send({ ...introPost(app.cfg), allowedMentions: { parse: [] } });
      app.db.kvSet(KV_INTRO, intro.id);
      app.log.info({ message: intro.id }, "intro post created");
    }

    const btnId = app.db.kvGet(KV_KEY);
    if (btnId) {
      const msg = await fetchMessage(app.client, channelId, btnId);
      if (msg) {
        await msg.edit({ ...pinnedPost(), allowedMentions: { parse: [] } }).catch(() => undefined);
        if (!msg.pinned) await msg.pin().catch(() => undefined);
        app.db.kvSet(KV_CHANNEL, channelId);
        return;
      }
      app.db.kvDel(KV_KEY);
    }
    const msg = await ch.send({ ...pinnedPost(), allowedMentions: { parse: [] } });
    app.db.kvSet(KV_KEY, msg.id);
    app.db.kvSet(KV_CHANNEL, channelId);
    await msg.pin().catch((err) => app.log.warn({ err }, "could not pin the report post (needs Manage Messages)"));
    app.log.info({ message: msg.id }, "button post created");
  }
}
