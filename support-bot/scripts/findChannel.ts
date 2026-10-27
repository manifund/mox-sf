/** `npx tsx scripts/findChannel.ts <name-fragment>` — list guild text channels whose name contains the fragment. Read-only. */
import { ChannelType, Client, GatewayIntentBits, PermissionFlagsBits } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const frag = (process.argv[2] ?? "").toLowerCase();
const c = new Client({ intents: [GatewayIntentBits.Guilds] });
c.once("clientReady", async () => {
  const g = await c.guilds.fetch(cfg.guild_id);
  const me = await g.members.fetchMe();
  const chans = await g.channels.fetch();
  for (const ch of chans.values()) {
    if (!ch || ch.type !== ChannelType.GuildText || !ch.name.toLowerCase().includes(frag)) continue;
    const p = ch.permissionsFor(me);
    console.log(`#${ch.name.padEnd(28)} ${ch.id}  category: ${ch.parent?.name ?? "-"}  bot: view=${p.has(PermissionFlagsBits.ViewChannel)} send=${p.has(PermissionFlagsBits.SendMessages)} privThreads=${p.has(PermissionFlagsBits.CreatePrivateThreads)} manageThreads=${p.has(PermissionFlagsBits.ManageThreads)} manageMsgs=${p.has(PermissionFlagsBits.ManageMessages)}`);
  }
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
