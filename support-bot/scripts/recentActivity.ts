/** Read-only: last few messages in #ask-staff and in its active threads. */
import { Client, GatewayIntentBits } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
c.once("clientReady", async () => {
  const ch = await c.channels.fetch(cfg.chat_intake.channel_ids[0]!);
  if (!ch || !ch.isTextBased() || !("threads" in ch)) return;
  const fmt = (m: { createdAt: Date; author: { username: string }; content: string; reference: { messageId?: string } | null; id: string }) =>
    `  ${m.createdAt.toISOString().slice(11, 19)} ${m.author.username.padEnd(16)} id=${m.id}${m.reference?.messageId ? ` replyTo=${m.reference.messageId}` : ""} "${m.content.slice(0, 110)}"`;
  console.log("#ask-staff (top level, newest first):");
  for (const m of (await ch.messages.fetch({ limit: 5 })).values()) console.log(fmt(m));
  const active = await ch.threads.fetchActive();
  for (const t of active.threads.values()) {
    console.log(`thread "${t.name}" id=${t.id} parentMessage=${t.id}`);
    for (const m of (await t.messages.fetch({ limit: 5 })).values()) console.log(fmt(m));
  }
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
