/** `npx tsx scripts/gateOne.ts "message text" [staff]` — run the chat-intake gate and the full triage on one message. Read-only. */
import { loadChatIntakePrompt, loadConfig, loadDotEnv, loadEnv, loadPrompt } from "../src/config.js";
import { intakeDecision, isCautious } from "../src/chatIntake.js";
import { TriageAI } from "../src/triage/ai.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const text = process.argv[2] ?? "";
const staff = process.argv[3] === "staff";
const gateAI = new TriageAI(env.ANTHROPIC_API_KEY!, env.TRIAGE_MODEL, "", 10000);
const triageAI = new TriageAI(env.ANTHROPIC_API_KEY!, env.TRIAGE_MODEL, loadPrompt(cfg), 10000);

const g = await gateAI.classifyChat(loadChatIntakePrompt(cfg), text, staff);
console.log("chat gate:", JSON.stringify(g));
const d = intakeDecision(cfg, g);
console.log("automatic decision:", d, d && isCautious(cfg, d, g) ? `(waits ${cfg.chat_intake.cautious.wait_minutes} min; skipped if staff answer first)` : "");
const t = await triageAI.triage({ what: text, where: "(not stated)", localTime: new Date().toISOString(), openTickets: [] });
console.log("full triage (if it had been filed through the modal):", JSON.stringify(t?.output));
