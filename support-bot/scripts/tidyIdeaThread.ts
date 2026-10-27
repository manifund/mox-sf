/** `npx tsx scripts/tidyIdeaThread.ts <ticketId>` — re-render an idea's opener and remove issue-only bot prompts from its thread. */
import { Client, GatewayIntentBits } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { Db } from "../src/db.js";
import { chatIntakeMissingLocation, threadOpening } from "../src/render.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const id = Number(process.argv[2]);
const db = new Db(env.DATABASE_PATH, cfg.airtable.first_ticket_number);
const t = db.getTicket(id);
if (!t || t.kind !== "idea" || !t.thread_id) throw new Error(`ticket ${id} is not an idea with a thread`);
const openerId = db.kvGet(`opener:${id}`);
const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
c.once("clientReady", async () => {
  const th = await c.channels.fetch(t.thread_id!);
  if (!th || !th.isTextBased()) throw new Error("thread not found");
  if (openerId) {
    const m = await th.messages.fetch(openerId);
    await m.edit({ ...threadOpening(t), allowedMentions: { parse: [] } });
    console.log("opener rewritten");
  }
  const ask = chatIntakeMissingLocation();
  for (const m of (await th.messages.fetch({ limit: 50 })).values()) {
    if (m.author.id === c.user!.id && m.content === ask) {
      await m.delete();
      console.log("removed the location question");
    }
  }
  db.close();
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
