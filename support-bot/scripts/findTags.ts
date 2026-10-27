/** `npx tsx scripts/findTags.ts <channelId> [--queue]` — recent messages that tag the bot (user or role), threads included; --queue replays the newest. */
import { ChannelType, Client, GatewayIntentBits, type Message } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { Db } from "../src/db.js";
import { MANUAL_INTAKE_PREFIX } from "../src/handlers/chatIntake.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const channelId = process.argv[2]!;
const queue = process.argv.includes("--queue");
const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
c.once("clientReady", async () => {
  const g = await c.guilds.fetch(cfg.guild_id);
  const me = await g.members.fetchMe();
  const re = new RegExp(`<@!?${c.user!.id}>|<@&${me.roles.botRole?.id ?? "x"}>`);
  const ch = await c.channels.fetch(channelId);
  if (!ch || ch.type !== ChannelType.GuildText) throw new Error("not a text channel");
  const hits: { m: Message; where: string }[] = [];
  for (const m of (await ch.messages.fetch({ limit: 100 })).values()) if (re.test(m.content)) hits.push({ m, where: `#${ch.name}` });
  for (const t of (await ch.threads.fetchActive()).threads.values())
    for (const m of (await t.messages.fetch({ limit: 50 })).values()) if (re.test(m.content)) hits.push({ m, where: `thread "${t.name}"` });
  hits.sort((a, b) => b.m.createdTimestamp - a.m.createdTimestamp);
  for (const { m, where } of hits.slice(0, 5))
    console.log(`${m.createdAt.toISOString()} ${where} · ${m.author.username} · id=${m.id}${m.reference?.messageId ? ` replyTo=${m.reference.messageId}` : ""} · "${m.content.slice(0, 120)}"`);
  if (queue && hits[0]) {
    const db = new Db(env.DATABASE_PATH, cfg.airtable.first_ticket_number);
    db.kvSet(`${MANUAL_INTAKE_PREFIX}${hits[0].m.channelId}:${hits[0].m.id}`, new Date().toISOString());
    db.close();
    console.log(`queued replay of ${hits[0].m.id}; the bot picks it up within 30s`);
  }
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
