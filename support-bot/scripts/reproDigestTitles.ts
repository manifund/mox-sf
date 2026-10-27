/** Debug: run ensureDigestSummaries exactly as the bot does, against a throwaway copy of the DB. */
import { startOfLocalDayIso } from "../src/util/time.js";
import fs from "node:fs";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { Db } from "../src/db.js";
import { ensureDigestSummaries } from "../src/digestSummary.js";
import { log } from "../src/log.js";
import { TriageAI } from "../src/triage/ai.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const copy = "/private/tmp/claude-502/-Users-Jen-aisafetyfair/15092915-ab8c-4132-86e8-f1d0f6e6ce7f/scratchpad/mox-copy.db";
fs.copyFileSync(env.DATABASE_PATH, copy);
const db = new Db(copy, cfg.airtable.first_ticket_number);
const ai = new TriageAI(env.ANTHROPIC_API_KEY!, env.TRIAGE_MODEL, "", 8000); // the bot's real timeout

const since = startOfLocalDayIso(cfg.claudio_hours.tz);
const today = [...db.listCreatedSince(since), ...db.listClosedSince(since)];
const open = [...db.listOpen().filter((t) => t.kind !== "idea"), ...today.filter((t) => t.kind !== "question")].filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);
console.log(`tickets: ${open.map((t) => t.id).join(", ")}`);
await ensureDigestSummaries({ ai, db, log } as never, open);
for (const t of open) console.log(`${t.id}: ${db.getTicket(t.id)!.digest_summary ?? "(none)"}`);
db.close();
