/** One-off: set the Undo button label on every chat-intake confirmation already posted. */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, GatewayIntentBits, type MessageActionRowComponentBuilder } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { Db } from "../src/db.js";
import { cid } from "../src/util/ids.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const db = new Db(env.DATABASE_PATH, cfg.airtable.first_ticket_number);
const c = new Client({ intents: [GatewayIntentBits.Guilds] });
c.once("clientReady", async () => {
  for (const { key, value } of db.kvList("chat_reply:")) {
    const ticketId = Number(key.split(":")[1]);
    const [channelId, messageId] = value.split(":");
    const t = db.getTicket(ticketId);
    if (!t || t.status === "not_a_ticket" || !channelId || !messageId) continue;
    try {
      const ch = await c.channels.fetch(channelId);
      if (!ch || !ch.isTextBased()) continue;
      const msg = await ch.messages.fetch(messageId);
      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId(cid("chat", "undo", ticketId)).setLabel("Undo").setEmoji("↩️").setStyle(ButtonStyle.Secondary),
      );
      await msg.edit({ components: [row], allowedMentions: { parse: [] } });
      console.log(`relabelled ticket ${ticketId}`);
    } catch (err) {
      console.log(`skip ticket ${ticketId}: ${(err as Error).message}`);
    }
  }
  db.close();
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
