/** Debug: run the digest-title prompt on today's tickets and show the raw output and each verdict. No writes. */
import fs from "node:fs";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { Db } from "../src/db.js";
import { isFaithful } from "../src/digestSummary.js";
import { TriageAI } from "../src/triage/ai.js";
import { startOfLocalDayIso } from "../src/util/time.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const db = new Db(env.DATABASE_PATH, cfg.airtable.first_ticket_number);
const ts = [...db.listOpen(), ...db.listCreatedSince(startOfLocalDayIso(cfg.claudio_hours.tz))].filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i && t.kind !== "question");
const ai = new TriageAI(env.ANTHROPIC_API_KEY!, env.TRIAGE_MODEL, "", 20000);
const user = ts.map((t) => `${t.id}: ${t.description.replace(/\s+/g, " ").slice(0, 600)}${t.location && t.location !== "Not stated" ? ` (location given: ${t.location})` : ""}`).join("\n");
const out = await ai.complete(fs.readFileSync("prompts/digest-summary.md", "utf8"), user, 900);
console.log("RAW:\n" + (out ?? "(null)") + "\n");
for (const line of (out ?? "").split("\n")) {
  const m = /^\s*(?:MOX-)?(\d+)\s*[:.)-]\s*(.+?)\s*$/.exec(line);
  if (!m) continue;
  const t = ts.find((x) => x.id === Number(m[1]));
  if (!t) continue;
  console.log(`${isFaithful(m[2]!, `${t.description} ${t.location}`) ? "ok  " : "REJ "} ${t.id}: ${m[2]}`);
}
db.close();
