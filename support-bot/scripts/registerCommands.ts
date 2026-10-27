/** Registers /log and /mox as guild commands. Run once per deploy: `npm run register-commands`. */
import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);

const commands = [
  new SlashCommandBuilder()
    .setName("log")
    .setDescription("Staff: record something you fixed in person so it lands on the board and in the digest")
    .addStringOption((o) => o.setName("what").setDescription("What you fixed").setRequired(true).setMaxLength(300))
    .addStringOption((o) => o.setName("where").setDescription("Location").setMaxLength(100))
    .addUserOption((o) => o.setName("asked_by").setDescription("Who asked"))
    .addIntegerOption((o) => o.setName("minutes").setDescription("Minutes it took").setMinValue(1).setMaxValue(600))
    .setDefaultMemberPermissions("0"),
  new SlashCommandBuilder()
    .setName("mox")
    .setDescription("Staff: bot maintenance")
    .addSubcommand((s) => s.setName("requeue").setDescription("Rebuild the standing queue"))
    .addSubcommand((s) =>
      s.setName("resync").setDescription("Re-send a ticket to Airtable and refresh its cards").addIntegerOption((o) => o.setName("ticket").setDescription("Ticket number, e.g. 104").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("pin").setDescription("Re-create the pinned report post if it went missing"))
    .addSubcommand((s) =>
      s.setName("intake").setDescription("Run chat intake on an existing message (link or id)").addStringOption((o) => o.setName("message").setDescription("Message link, or id if run in the same channel").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("digest").setDescription("Post an issue digest: open work (react 👀/✅), closed today, ideas"))
    .addSubcommand((s) => s.setName("status").setDescription("Bot status"))
    .setDefaultMemberPermissions("0"),
].map((c) => c.toJSON());

const rest = new REST().setToken(env.DISCORD_TOKEN);
const guildId = env.DISCORD_GUILD_ID ?? cfg.guild_id;
await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, guildId), { body: commands });
console.log(`Registered ${commands.length} commands in guild ${guildId}. Grant /log and /mox to the mox staff role in Server Settings → Integrations.`);
