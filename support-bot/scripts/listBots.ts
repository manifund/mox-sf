/** `npx tsx scripts/listBots.ts` — which bot this token is, every bot in the guild with roles, and who holds @mox staff. Read-only. */
import { Client, GatewayIntentBits } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
client.once("clientReady", async () => {
  const guild = await client.guilds.fetch(cfg.guild_id);
  const members = await guild.members.fetch();
  console.log(`This token logs in as: ${client.user!.tag} (user id ${client.user!.id}, app ${env.DISCORD_CLIENT_ID})\n`);
  console.log("Bots in the server and their roles:");
  for (const m of members.filter((m) => m.user.bot).values())
    console.log(`  ${m.user.tag.padEnd(28)} id ${m.id}  roles: ${m.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.name).join(", ") || "(none)"}`);
  const staff = members.filter((m) => m.roles.cache.has(cfg.roles.mox_staff));
  console.log(`\n@mox staff members (${staff.size}): ${staff.map((m) => m.user.tag).join(", ")}`);
  client.destroy();
});
await client.login(env.DISCORD_TOKEN);
