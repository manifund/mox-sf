/** `npx tsx scripts/repairIdea.ts <ticketId>` — re-apply the idea endings for a chat ticket that triage turned into an idea before logIdea knew how. */
import { Client, GatewayIntentBits } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { Db } from "../src/db.js";
import { chatIntakeIdeaReply, ideaAck } from "../src/render.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const id = Number(process.argv[2]);
const db = new Db(env.DATABASE_PATH, cfg.airtable.first_ticket_number);
const t = db.getTicket(id);
if (!t || t.kind !== "idea") throw new Error(`ticket ${id} is not an idea`);
const [confirmThread, confirmMsg] = (db.kvGet(`chat_reply:${id}`) ?? "").split(":");
const c = new Client({ intents: [GatewayIntentBits.Guilds] });
c.once("clientReady", async () => {
  if (t.thread_id && t.thread_id !== confirmThread) {
    const own = await c.channels.fetch(t.thread_id);
    if (own && own.isTextBased() && "send" in own) {
      const already = (await own.messages.fetch({ limit: 50 })).some((m) => m.author.id === c.user!.id && m.content === ideaAck(t.id));
      if (already) console.log("idea ack already in the ticket's own thread");
      else {
        await own.send({ content: ideaAck(t.id), allowedMentions: { parse: [] } });
        console.log("posted idea ack in the ticket's own thread");
      }
    }
  }
  if (confirmThread && confirmMsg && t.reporter_id) {
    const ch = await c.channels.fetch(confirmThread);
    if (ch && ch.isTextBased()) {
      const m = await ch.messages.fetch(confirmMsg);
      await m.edit({ content: chatIntakeIdeaReply(t), allowedMentions: { parse: [] } }); // tag-triggered: no author mention
      console.log("corrected the chat confirmation to the idea copy");
    }
  }
  db.close();
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
