/**
 * `npx tsx scripts/postStaffGuide.ts [--replace <oldMessageId>]`
 * Posts the staff guide as plain text (visible to everyone, unlike embeds), pins it, and remembers its id
 * so the next run edits it in place. --replace deletes an old copy first.
 */
import { Client, GatewayIntentBits } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { Db } from "../src/db.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const intake = `<#${cfg.channels.report_an_issue}>`;
const staff = `<@&${cfg.roles.mox_staff}>`;
const ask = `<#${cfg.chat_intake.channel_ids[0]}>`;
const general = "<#1342558808639275008>";
// angle brackets stop Discord from adding a big link preview under the message
const board = cfg.airtable.board_url ? `<${cfg.airtable.board_url}>` : "";
const KV = "staff_guide_message_id";

function buildText(botId: string): string {
  const bot = `<@${botId}>`;
  return [
    "## 🔧 How the support bot works",
    "Every building report becomes a ticket with one owner.",
    "",
    "**Where reports come in**",
    `• **${intake} is private by design.** Members can't post there, so please **don't send messages in it** either. It only holds the **Report an issue** button.`,
    `• **Each report opens a private thread** that only the reporter and ${staff} can see. You can see every ticket, assigned to you or not.`,
    "• **Ideas and nice-to-haves** skip the thread and go straight onto the board.",
    "",
    "**Working a ticket**",
    "The bot posts a card in the thread and @mentions the owner. From the card:",
    "• **React 👀** to claim it. The reporter is told you're on it.",
    "• **React ✅** when it's done. A reply in the thread within 10 minutes becomes the resolution note.",
    "• **Type in the thread** to talk to the reporter. That doesn't change the ticket.",
    "• **Buttons:** ↪️ Reassign, 🚫 Won't do (reason required), ⚙️ Priority, ❓ Not a ticket.",
    "",
    `**Tagging ${bot}**`,
    `**Members and staff alike can tag ${bot}** to turn a chat message into a ticket.`,
    "• Tag it **in the message**, **in a reply** to it, or **in its thread**.",
    "• A **staff tag always opens a ticket**. A member's tag does too, unless it clearly isn't a request.",
    `• The bot answers in a thread, never in the channel. ${ask} is also watched automatically; ${general} is **tag only**.`,
    `• **Ask or instruct:** tag ${bot} on a ticket (its thread, its digest line, or "MOX-123") to ask about it, or tell it to reprioritize, reassign, close or won't-do it.`,
    "",
    "**Tracking**",
    board ? `• **Airtable has every ticket:** ${board}. Change status, owner or priority there too: Discord catches up within a minute.` : "",
    "• The **pinned queue** in this channel shows what's open, and a **digest** posts here Mondays at 9am.",
    "• Fixed something in person? `/log what:<what> where:<where>` so it counts.",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
}

const c = new Client({ intents: [GatewayIntentBits.Guilds] });
c.once("clientReady", async () => {
  try {
    const ch = await c.channels.fetch(cfg.digest.channel_id);
    if (!ch || !ch.isTextBased() || !("send" in ch)) throw new Error("digest channel not sendable");
    const text = buildText(c.user!.id);
    if (text.length > 2000) throw new Error(`guide is ${text.length} chars; plain messages allow 2000`);
    const db = new Db(env.DATABASE_PATH, cfg.airtable.first_ticket_number);
    const replaceIdx = process.argv.indexOf("--replace");
    const oldId = replaceIdx > 0 ? process.argv[replaceIdx + 1] : undefined;
    if (oldId) {
      const old = await ch.messages.fetch(oldId).catch(() => null);
      if (old) await old.delete();
      console.log(`deleted old copy ${oldId}`);
    }
    const known = !oldId ? db.kvGet(KV) : undefined;
    const existing = known ? await ch.messages.fetch(known).catch(() => null) : null;
    // flags: [] clears a "hide embeds" flag left on an old copy; no embeds are used anyway
    const msg = existing
      ? await existing.edit({ content: text, embeds: [], allowedMentions: { parse: [] } })
      : await ch.send({ content: text, allowedMentions: { parse: [] } });
    if (!msg.pinned) await msg.pin().catch((err: Error) => console.log(`could not pin: ${err.message}`));
    db.kvSet(KV, msg.id);
    db.close();
    console.log(`${existing ? "edited" : "posted"} ${msg.id} in #${"name" in ch ? ch.name : cfg.digest.channel_id} (${text.length} chars), pinned`);
  } catch (err) {
    console.error(`failed: ${(err as Error).message}`);
    process.exitCode = 1;
  } finally {
    c.destroy();
  }
});
await c.login(env.DISCORD_TOKEN);
