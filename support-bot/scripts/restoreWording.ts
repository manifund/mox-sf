/** One-off: put every ticket's title and summary back to the reporter's own words, then ask the bot to resync each one. */
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { RESYNC_PREFIX } from "../src/core/resync.js";
import { Db } from "../src/db.js";
import { summaryFromWords, tidyWords, titleFromWords } from "../src/triage/wording.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const db = new Db(env.DATABASE_PATH, cfg.airtable.first_ticket_number);
const all = db.sqlite.prepare(`SELECT * FROM tickets ORDER BY id`).all() as ReturnType<Db["getTicket"]>[];
for (const t of all) {
  if (!t) continue;
  const description = tidyWords(t.description);
  const title = titleFromWords(description);
  const staff_summary = summaryFromWords(description);
  console.log(`MOX-${t.id}\n   was: ${t.title ?? "-"}\n   now: ${title}`);
  db.updateTicket(t.id, { description, title, staff_summary });
  db.kvSet(`${RESYNC_PREFIX}${t.id}`, new Date().toISOString());
}
db.close();
console.log(`\nqueued ${all.length} tickets for resync; the running bot applies them within 30s`);
