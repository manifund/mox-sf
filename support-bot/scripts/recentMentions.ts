/** Read-only: recent messages in #ask-staff that mention the bot user or its managed role. */
import { Client, GatewayIntentBits } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
c.once("clientReady", async () => {
  const guild = await c.guilds.fetch(cfg.guild_id);
  const me = await guild.members.fetchMe();
  const botRole = me.roles.botRole;
  console.log(`bot user ${c.user!.id} · managed role ${botRole?.id} (${botRole?.name})`);
  for (const id of [...cfg.chat_intake.channel_ids, cfg.channels.report_an_issue]) {
    const ch = await c.channels.fetch(id);
    if (!ch || !ch.isTextBased()) continue;
    const msgs = await ch.messages.fetch({ limit: 30 });
    for (const m of msgs.values()) {
      const u = m.mentions.users.has(c.user!.id);
      const r = botRole ? m.mentions.roles.has(botRole.id) : false;
      if (u || r || /support/i.test(m.content)) console.log(`${m.createdAt.toISOString()} #${"name" in ch ? ch.name : id} by ${m.author.username} · userMention=${u} roleMention=${r} · thread=${m.hasThread} · "${m.content.slice(0, 100)}"`);
    }
  }
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
