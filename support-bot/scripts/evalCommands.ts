/** Dry run: classify sample staff instructions against a real ticket and show the resulting plan. Changes nothing. */
import fs from "node:fs";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { Db } from "../src/db.js";
import { planCommand } from "../src/ticketCommands.js";
import { TriageAI } from "../src/triage/ai.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const db = new Db(env.DATABASE_PATH, cfg.airtable.first_ticket_number);
const id = Number(process.argv[2] ?? 118);
const t = db.getTicket(id)!;
db.close();
const ai = new TriageAI(env.ANTHROPIC_API_KEY!, env.TRIAGE_MODEL, "", 10000);
const prompt = fs.readFileSync("prompts/ticket-command.md", "utf8");
const samples = [
  "can you reprioritize this to important",
  "make it urgent",
  "bump this up and give it to carolina",
  "this should go to jake",
  "let's actually do this one",
  "low priority, whenever",
  "this is done",
  "won't do, too expensive for now",
  "what's this about?",
  "who reported this and when?",
  "give it to whit",
];
for (const text of samples) {
  const c = await ai.ticketCommand(prompt, `Ticket: MOX-${t.id} · ${t.kind} · ${t.status} · ${t.priority} · owner ${t.owner_key}\nWhat the reporter wrote: """${t.description.slice(0, 600)}"""\n\nStaff message: ${text}`);
  const lower = text.toLowerCase();
  const plan = planCommand(Object.keys(cfg.owners), t, c, (key) => lower.includes(key.replace(/_/g, " ")) || lower.includes((cfg.owners as Record<string, { display_name: string }>)[key]?.display_name.toLowerCase() ?? "\u0000"));
  console.log(`${JSON.stringify(plan).padEnd(58)} <- "${text}"`);
}
