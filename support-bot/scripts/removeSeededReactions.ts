/** One-off: take the bot's own pre-added 👀/✅ off every ticket card already posted. Staff reactions stay. */
import { Client, GatewayIntentBits } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { Db } from "../src/db.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const db = new Db(env.DATABASE_PATH, cfg.airtable.first_ticket_number);
const cards = db.sqlite.prepare(`SELECT ticket_id, channel_id, message_id FROM ticket_surfaces WHERE kind IN ('thread','channel','digest')`).all() as { ticket_id: number; channel_id: string; message_id: string }[];
db.close();
const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions] });
c.once("clientReady", async () => {
  let removed = 0;
  for (const card of cards) {
    const ch = await c.channels.fetch(card.channel_id).catch(() => null);
    if (!ch || !ch.isTextBased()) continue;
    const m = await ch.messages.fetch(card.message_id).catch(() => null);
    if (!m) continue;
    for (const emoji of ["👀", "✅"]) {
      const r = m.reactions.cache.find((x) => x.emoji.name === emoji);
      if (r?.me) {
        await r.users.remove(c.user!.id).catch(() => undefined);
        removed++;
      }
    }
  }
  console.log(`removed ${removed} pre-added reactions across ${cards.length} cards`);
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
