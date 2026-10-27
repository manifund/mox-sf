/** `npx tsx scripts/showMessages.ts <channelId> <messageId>...` — print full message text. Read-only. */
import { Client, GatewayIntentBits } from "discord.js";
import { loadDotEnv, loadEnv } from "../src/config.js";

loadDotEnv();
const env = loadEnv();
const [channelId, ...ids] = process.argv.slice(2);
const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
c.once("clientReady", async () => {
  const ch = await c.channels.fetch(channelId!);
  if (!ch || !ch.isTextBased()) throw new Error("channel not found");
  for (const id of ids) {
    const m = await ch.messages.fetch(id);
    console.log(`--- ${m.author.username} (${m.createdAt.toISOString()})${m.reference?.messageId ? ` replying to ${m.reference.messageId}` : ""}\n${m.content}\n`);
  }
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
