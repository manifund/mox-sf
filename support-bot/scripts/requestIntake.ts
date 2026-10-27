/** `npx tsx scripts/requestIntake.ts "<search text>"` — find a recent #ask-staff message containing the text and ask the running bot to run intake on it. */
import { Client, GatewayIntentBits } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { Db } from "../src/db.js";
import { MANUAL_INTAKE_PREFIX } from "../src/handlers/chatIntake.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const needle = (process.argv[2] ?? "").toLowerCase();
if (!needle) throw new Error("search text required");
const channelId = cfg.chat_intake.channel_ids[0]!;
const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
c.once("clientReady", async () => {
  const ch = await c.channels.fetch(channelId);
  if (!ch || !ch.isTextBased()) throw new Error("channel not found");
  let before: string | undefined;
  let found = null as null | { id: string; author: string; content: string; createdAt: Date };
  for (let page = 0; page < 10 && !found; page++) {
    const batch = await ch.messages.fetch({ limit: 100, before });
    for (const m of batch.values()) if (!m.author.bot && m.content.toLowerCase().includes(needle)) { found = { id: m.id, author: m.author.username, content: m.content, createdAt: m.createdAt }; break; }
    before = batch.last()?.id;
    if (!before || batch.size < 100) break;
  }
  if (!found) { console.log("no matching message in the last ~1000"); c.destroy(); return; }
  console.log(`found ${found.id} by ${found.author} on ${found.createdAt.toISOString().slice(0, 10)}: "${found.content.slice(0, 90)}"`);
  const db = new Db(env.DATABASE_PATH, cfg.airtable.first_ticket_number);
  db.kvSet(`${MANUAL_INTAKE_PREFIX}${channelId}:${found.id}`, new Date().toISOString());
  db.close();
  console.log("queued; the running bot picks it up within 30s");
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
