/** `npx tsx scripts/threadTail.ts <channelOrThreadId> [n]` — last n messages, oldest first. Read-only. */
import { Client, GatewayIntentBits } from "discord.js";
import { loadDotEnv, loadEnv } from "../src/config.js";

loadDotEnv();
const env = loadEnv();
const [id, n] = process.argv.slice(2);
const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
c.once("clientReady", async () => {
  const ch = await c.channels.fetch(id!);
  if (!ch || !ch.isTextBased()) throw new Error("not found");
  const msgs = [...(await ch.messages.fetch({ limit: Number(n ?? 6) })).values()].reverse();
  for (const m of msgs) console.log(`  ${m.author.username}: ${(m.content || m.embeds[0]?.description || "").replace(/\n/g, " ⏎ ").slice(0, 200)}`);
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
