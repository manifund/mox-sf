/** Debug: run the title checker on the saved digest titles. No writes. */
import fs from "node:fs";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { Db } from "../src/db.js";
import { TriageAI } from "../src/triage/ai.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const db = new Db(env.DATABASE_PATH, cfg.airtable.first_ticket_number);
const ts = (db.sqlite.prepare(`SELECT * FROM tickets WHERE digest_summary IS NOT NULL ORDER BY id`).all() as NonNullable<ReturnType<Db["getTicket"]>>[]);
const ai = new TriageAI(env.ANTHROPIC_API_KEY!, env.TRIAGE_MODEL, "", 20000);
const user = ts.map((t) => `${t.id}\n  message: ${t.description.replace(/\s+/g, " ").slice(0, 600)}\n  title: ${t.digest_summary}`).join("\n");
const out = await ai.complete(fs.readFileSync("prompts/digest-verify.md", "utf8"), user, 600);
const verdict = new Map((out ?? "").split("\n").map((l) => /^\s*(\d+)\s*:\s*(ok|changed)/i.exec(l)).filter(Boolean).map((m) => [Number(m![1]), m![2]!.toLowerCase()]));
for (const t of ts) console.log(`${(verdict.get(t.id) ?? "?").padEnd(8)} ${t.id}: ${t.digest_summary}`);
db.close();
