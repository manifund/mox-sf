/** Read-only: who started a thread, what the starter says, and every message in it with author ids. */
import { Client, GatewayIntentBits } from "discord.js";
import { loadDotEnv, loadEnv } from "../src/config.js";

loadDotEnv();
const env = loadEnv();
const id = process.argv[2]!;
const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
c.once("clientReady", async () => {
  const th = await c.channels.fetch(id);
  if (!th || !th.isThread()) throw new Error("not a thread");
  const starter = await th.fetchStarterMessage().catch(() => null);
  console.log(`thread "${th.name}" · owner ${th.ownerId} · parent #${th.parent?.name}`);
  console.log(`starter: ${starter ? `${starter.author.username} (${starter.author.id}) "${starter.content}"` : "none"}`);
  for (const m of [...(await th.messages.fetch({ limit: 20 })).values()].reverse())
    console.log(`  [${m.type}${m.system ? " system" : ""}] ${m.author.username} (${m.author.id}): "${m.content.slice(0, 160)}"`);
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
