/** `npx tsx scripts/showSurfaces.ts <ticketId>` — the ticket's title, thread name and every card's current text. Read-only. */
import { Client, GatewayIntentBits } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { Db } from "../src/db.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const id = Number(process.argv[2]);
const db = new Db(env.DATABASE_PATH, cfg.airtable.first_ticket_number);
const t = db.getTicket(id)!;
const surfaces = db.surfaces(id);
const confirm = db.kvGet(`chat_reply:${id}`);
db.close();
console.log(`MOX-${id} · ${t.status} · ${t.priority} · owner ${t.owner_key}\n  title:   ${t.title}\n  summary: ${t.staff_summary}`);
const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
c.once("clientReady", async () => {
  if (t.thread_id) {
    const th = await c.channels.fetch(t.thread_id).catch(() => null);
    console.log(`  thread:  ${th && th.isThread() ? `"${th.name}"${th.archived ? " (archived)" : ""}` : "deleted"}`);
  }
  if (confirm) {
    const th = await c.channels.fetch(confirm.split(":")[0]!).catch(() => null);
    console.log(`  #ask-staff thread: ${th && th.isThread() ? `"${th.name}"` : "deleted"}`);
  }
  for (const s of surfaces) {
    const ch = await c.channels.fetch(s.channel_id).catch(() => null);
    const m = ch && ch.isTextBased() ? await ch.messages.fetch(s.message_id).catch(() => null) : null;
    const where = ch && "name" in ch ? `#${ch.name}` : s.channel_id;
    const text = m ? (m.content || m.embeds[0]?.description || "").replace(/\n/g, " ⏎ ").slice(0, 170) : "(message gone)";
    console.log(`  ${s.kind.padEnd(7)} ${where}: ${text}`);
  }
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
