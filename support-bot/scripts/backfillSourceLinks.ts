/** One-off: fill source_message_url for chat tickets captured before the column existed, and queue the Airtable update. */
import { Client, GatewayIntentBits } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { Db } from "../src/db.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const db = new Db(env.DATABASE_PATH, cfg.airtable.first_ticket_number);
const candidates = [...cfg.chat_intake.channel_ids, "1342558808639275008"];
const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
c.once("clientReady", async () => {
  for (const { key, value } of db.kvList("chat_intaken:")) {
    const messageId = key.split(":")[1]!;
    const t = db.getTicket(Number(value));
    if (!t || t.source_message_url) continue;
    let url: string | null = null;
    // a thread started on the message shares its id, and its parent is the channel
    const th = await c.channels.fetch(messageId).catch(() => null);
    if (th && th.isThread() && th.parentId) url = `https://discord.com/channels/${cfg.guild_id}/${th.parentId}/${messageId}`;
    for (const ch of candidates) {
      if (url) break;
      const chan = await c.channels.fetch(ch).catch(() => null);
      if (chan && chan.isTextBased() && (await chan.messages.fetch(messageId).catch(() => null))) url = `https://discord.com/channels/${cfg.guild_id}/${ch}/${messageId}`;
    }
    if (!url) {
      console.log(`MOX-${t.id}: original message not found`);
      continue;
    }
    db.updateTicket(t.id, { source_message_url: url });
    db.enqueueMirror(t.id, t.mirror_record_id ? "update" : "create", {});
    console.log(`MOX-${t.id}: ${url}`);
  }
  db.close();
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
