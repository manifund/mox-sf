/** One-off: delete the issue digest posted earlier today (its header, lines and lists) so a fresh one can replace it. */
import { Client, GatewayIntentBits } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { Db } from "../src/db.js";
import { startOfLocalDayIso } from "../src/util/time.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const db = new Db(env.DATABASE_PATH, cfg.airtable.first_ticket_number);
const since = new Date(startOfLocalDayIso(cfg.claudio_hours.tz)).getTime();
const guideId = db.kvGet("staff_guide_message_id");
const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
c.once("clientReady", async () => {
  const ch = await c.channels.fetch(cfg.digest.channel_id);
  if (!ch || !ch.isTextBased()) throw new Error("no channel");
  const digestSurfaceIds = new Set(
    (db.sqlite.prepare(`SELECT message_id FROM ticket_surfaces WHERE kind = 'digest'`).all() as { message_id: string }[]).map((r) => r.message_id),
  );
  let removed = 0;
  for (const m of (await ch.messages.fetch({ limit: 50 })).values()) {
    if (m.author.id !== c.user!.id || m.createdTimestamp < since || m.pinned || m.id === guideId) continue;
    const isDigest = digestSurfaceIds.has(m.id) || m.content.startsWith("## 📋 Issue digest") || m.content.startsWith("**✅ Closed today");
    if (!isDigest) continue;
    const reacts = [...m.reactions.cache.values()].map((r) => `${r.emoji.name}×${r.count}`).join(" ");
    await m.delete();
    db.removeSurface(m.id);
    removed++;
    console.log(`deleted ${m.id} ${reacts ? `(reactions: ${reacts})` : ""} "${m.content.slice(0, 50)}"`);
  }
  db.kvSet("digest_request", new Date().toISOString());
  db.close();
  console.log(`removed ${removed}; new digest requested`);
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
