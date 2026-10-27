/** `npx tsx scripts/dedupeBotMessages.ts <threadId>` — delete repeated identical bot messages in a thread, keeping the first. */
import { Client, GatewayIntentBits } from "discord.js";
import { loadDotEnv, loadEnv } from "../src/config.js";

loadDotEnv();
const env = loadEnv();
const threadId = process.argv[2]!;
const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
c.once("clientReady", async () => {
  const th = await c.channels.fetch(threadId);
  if (!th || !th.isTextBased()) throw new Error("thread not found");
  const msgs = [...(await th.messages.fetch({ limit: 50 })).values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const seen = new Set<string>();
  for (const m of msgs) {
    if (m.author.id !== c.user!.id || !m.content) continue;
    if (seen.has(m.content)) {
      await m.delete();
      console.log(`deleted duplicate: "${m.content.slice(0, 60)}"`);
    } else seen.add(m.content);
  }
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
