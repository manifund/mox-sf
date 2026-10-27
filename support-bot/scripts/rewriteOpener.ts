/** `npx tsx scripts/rewriteOpener.ts <ticketId>` — re-render a ticket's thread opener with the current copy. */
import { Client, GatewayIntentBits } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { Db } from "../src/db.js";
import { threadOpening } from "../src/render.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const id = Number(process.argv[2]);
const db = new Db(env.DATABASE_PATH, cfg.airtable.first_ticket_number);
const t = db.getTicket(id);
const openerId = db.kvGet(`opener:${id}`);
if (!t?.thread_id || !openerId) throw new Error(`ticket ${id} has no thread opener`);
const c = new Client({ intents: [GatewayIntentBits.Guilds] });
c.once("clientReady", async () => {
  const th = await c.channels.fetch(t.thread_id!);
  if (!th || !th.isTextBased()) throw new Error("thread not found");
  const m = await th.messages.fetch(openerId);
  await m.edit({ ...threadOpening(t), allowedMentions: { parse: [] } });
  console.log(`opener for ticket ${id} rewritten`);
  db.close();
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
