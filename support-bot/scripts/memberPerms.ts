/** `npx tsx scripts/memberPerms.ts <userId>` — what a member can do in the report channel, and which roles/overwrites grant it. Read-only. */
import { Client, GatewayIntentBits, PermissionFlagsBits } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const userId = process.argv[2]!;
const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
c.once("clientReady", async () => {
  const g = await c.guilds.fetch(cfg.guild_id);
  const member = await g.members.fetch(userId);
  const ch = await g.channels.fetch(cfg.channels.report_an_issue);
  if (!ch || !("permissionOverwrites" in ch) || !("permissionsLocked" in ch)) throw new Error("no channel");
  const p = ch.permissionsFor(member);
  const flags = { SendMessages: PermissionFlagsBits.SendMessages, CreatePublicThreads: PermissionFlagsBits.CreatePublicThreads, CreatePrivateThreads: PermissionFlagsBits.CreatePrivateThreads, SendMessagesInThreads: PermissionFlagsBits.SendMessagesInThreads, ManageThreads: PermissionFlagsBits.ManageThreads };
  console.log(`${member.user.username} in #${ch.name}: ${Object.entries(flags).map(([k, b]) => `${k}=${p.has(b)}`).join(" ")}`);
  console.log(`roles: ${member.roles.cache.filter((r) => r.id !== g.id).map((r) => `${r.name}${r.permissions.has(PermissionFlagsBits.SendMessages) ? "(server-wide send)" : ""}`).join(", ")}`);
  console.log(`channel synced with category "${ch.parent?.name}": ${ch.permissionsLocked}`);
  for (const o of ch.permissionOverwrites.cache.values()) {
    const who = o.type === 0 ? `role ${g.roles.cache.get(o.id)?.name ?? o.id}` : `member ${o.id}`;
    console.log(`  overwrite ${who}: allow=[${o.allow.toArray().join(",")}] deny=[${o.deny.toArray().join(",")}]`);
  }
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
