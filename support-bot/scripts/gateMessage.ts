/** `npx tsx scripts/gateMessage.ts <channelId> <messageId>` — run the chat gate on a real Discord message. Read-only. */
import { Client, GatewayIntentBits } from "discord.js";
import { loadChatIntakePrompt, loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { intakeDecision } from "../src/chatIntake.js";
import { TriageAI } from "../src/triage/ai.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const [channelId, messageId] = process.argv.slice(2);
const ai = new TriageAI(env.ANTHROPIC_API_KEY!, env.TRIAGE_MODEL, "", 10000);
const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
c.once("clientReady", async () => {
  const ch = await c.channels.fetch(channelId!);
  if (!ch || !ch.isTextBased()) throw new Error("channel not found");
  const m = await ch.messages.fetch(messageId!);
  console.log(`message (${m.content.length} chars): "${m.content.slice(0, 200)}"`);
  const g = await ai.classifyChat(loadChatIntakePrompt(cfg), m.content, false);
  console.log("gate:", JSON.stringify(g));
  console.log("automatic decision:", intakeDecision(cfg, g), "· if tagged:", intakeDecision(cfg, g, { force: true }));
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
