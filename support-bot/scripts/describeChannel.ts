/** `npx tsx scripts/describeChannel.ts <channelId>` — type, name, bot permissions and a few recent posts. Read-only. */
import { ChannelType, Client, GatewayIntentBits, PermissionFlagsBits } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const id = process.argv[2]!;
const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
c.once("clientReady", async () => {
  const g = await c.guilds.fetch(cfg.guild_id);
  const me = await g.members.fetchMe();
  console.log(`bot managed role: ${me.roles.botRole?.id} (${me.roles.botRole?.name})`);
  const ch = await c.channels.fetch(id).catch(() => null);
  if (!ch || !("guild" in ch)) return void (console.log("bot cannot see this channel"), c.destroy());
  const p = "permissionsFor" in ch ? ch.permissionsFor(me) : null;
  console.log(`#${"name" in ch ? ch.name : id} · type ${ChannelType[ch.type]} · category ${"parent" in ch ? ch.parent?.name ?? "-" : "-"}`);
  console.log(`bot: view=${p?.has(PermissionFlagsBits.ViewChannel)} send=${p?.has(PermissionFlagsBits.SendMessages)} sendInThreads=${p?.has(PermissionFlagsBits.SendMessagesInThreads)} publicThreads=${p?.has(PermissionFlagsBits.CreatePublicThreads)} history=${p?.has(PermissionFlagsBits.ReadMessageHistory)}`);
  if (ch.type === ChannelType.GuildForum && "threads" in ch) {
    const active = await ch.threads.fetchActive();
    for (const t of [...active.threads.values()].slice(0, 5)) console.log(`  post "${t.name}" id=${t.id} by ${t.ownerId}`);
  } else if (ch.isTextBased()) {
    for (const m of (await ch.messages.fetch({ limit: 5 })).values()) console.log(`  ${m.author.username}: "${m.content.slice(0, 90)}"`);
  }
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
