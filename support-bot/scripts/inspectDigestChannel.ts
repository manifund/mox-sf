/** Read-only: the staff guide message's state and the latest messages in the digest channel. */
import { Client, GatewayIntentBits } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
c.once("clientReady", async () => {
  const ch = await c.channels.fetch(cfg.digest.channel_id);
  if (!ch || !ch.isTextBased()) throw new Error("no channel");
  const guide = await ch.messages.fetch(process.argv[2] ?? "1555294349410041879").catch((e: Error) => e.message);
  if (typeof guide === "string") console.log(`guide message: ${guide}`);
  else console.log(`guide message: exists, posted ${guide.createdAt.toISOString()}, content=${guide.content.length} chars, embeds=${guide.embeds.length}, pinned=${guide.pinned}`);
  console.log("latest in channel:");
  for (const m of (await ch.messages.fetch({ limit: 8 })).values())
    console.log(`  ${m.createdAt.toISOString()} ${m.author.username} id=${m.id} pinned=${m.pinned} content=${m.content.length} embeds=${m.embeds.length} "${(m.content || m.embeds[0]?.title || m.embeds[0]?.description || "").slice(0, 60)}"`);
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
