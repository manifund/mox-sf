/** `npx tsx scripts/checkPermissions.ts` — what the bot can actually do in each configured channel. Read-only. */
import { Client, GatewayIntentBits, PermissionFlagsBits, type GuildBasedChannel } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);

const NEEDS: [string, bigint][] = [
  ["View", PermissionFlagsBits.ViewChannel],
  ["Send", PermissionFlagsBits.SendMessages],
  ["SendInThreads", PermissionFlagsBits.SendMessagesInThreads],
  ["CreatePrivThreads", PermissionFlagsBits.CreatePrivateThreads],
  ["CreatePubThreads", PermissionFlagsBits.CreatePublicThreads],
  ["ManageThreads", PermissionFlagsBits.ManageThreads],
  ["ManageMessages", PermissionFlagsBits.ManageMessages],
  ["AddReactions", PermissionFlagsBits.AddReactions],
  ["Embed", PermissionFlagsBits.EmbedLinks],
  ["Attach", PermissionFlagsBits.AttachFiles],
  ["History", PermissionFlagsBits.ReadMessageHistory],
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once("clientReady", async () => {
  const guild = await client.guilds.fetch(cfg.guild_id);
  const me = await guild.members.fetchMe();
  console.log(`Bot: ${me.user.tag} · roles: ${me.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.name).join(", ") || "(none)"}\n`);
  const staffRole = guild.roles.cache.get(cfg.roles.mox_staff) ?? (await guild.roles.fetch(cfg.roles.mox_staff));
  console.log(`@mox staff role: ${staffRole ? `#${staffRole.name}` : "NOT FOUND"}\n`);
  let problems = 0;
  for (const [name, id] of Object.entries(cfg.channels)) {
    let ch: GuildBasedChannel | null = null;
    try {
      ch = await guild.channels.fetch(id);
    } catch {
      /* not visible */
    }
    if (!ch) {
      console.log(`✖ ${name.padEnd(24)} ${id}  — bot cannot see this channel at all`);
      problems++;
      continue;
    }
    const perms = ch.permissionsFor(me);
    const missing = NEEDS.filter(([, bit]) => !perms.has(bit)).map(([label]) => label);
    // thread perms only matter on the report channel; staff-channel cards need send/react/embed
    const relevant = name === "report_an_issue" ? missing : missing.filter((m) => !m.includes("Threads"));
    console.log(`${relevant.length ? "✖" : "✓"} ${name.padEnd(24)} #${ch.name.padEnd(26)} ${relevant.length ? "missing: " + relevant.join(", ") : "ok"}`);
    if (relevant.length) problems++;
    if (name === "report_an_issue" && staffRole && "permissionsFor" in ch) {
      const staff = ch.permissionsFor(staffRole);
      const everyone = ch.permissionsFor(guild.roles.everyone);
      console.log(`    @mox staff ManageThreads: ${staff.has(PermissionFlagsBits.ManageThreads) ? "✓" : "✖ (C6 broken — staff won't see each other's tickets)"}`);
      console.log(`    @everyone  ManageThreads: ${everyone.has(PermissionFlagsBits.ManageThreads) ? "✖ (privacy broken — members would see private tickets)" : "✓ (off)"}`);
      console.log(`    @everyone  SendMessages:  ${everyone.has(PermissionFlagsBits.SendMessages) ? "△ on (spec says off; harmless)" : "✓ (off)"}`);
    }
  }
  console.log(`\n${problems ? `${problems} channel(s) need fixing` : "All channels OK"}`);
  client.destroy();
  process.exit(problems ? 1 : 0);
});
await client.login(env.DISCORD_TOKEN);
