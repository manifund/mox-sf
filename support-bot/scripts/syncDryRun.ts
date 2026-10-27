/** Read-only: compare every Airtable row with the bot's record and show what the sync would do, ignoring timing guards. */
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { Db } from "../src/db.js";
import { AirtableMirror } from "../src/airtable.js";
import { planSync } from "../src/airtableSync.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const db = new Db(env.DATABASE_PATH, cfg.airtable.first_ticket_number);
const mirror = new AirtableMirror(env.AIRTABLE_TOKEN, cfg, db);
const rows = await mirror.listEditableRows();
const seen = new Set<string>();
for (const row of rows) {
  seen.add(row.recordId);
  const t = db.getTicketByMirrorRecord(row.recordId);
  if (!t) { console.log(`row ${row.recordId}: no matching ticket`); continue; }
  const ops = planSync(t, row, Object.keys(cfg.owners), row.lastEditedBy ?? "?");
  if (ops.length) console.log(`MOX-${t.id}: bot=${t.status}/${t.owner_key}/${t.priority} airtable=${row.status}/${row.owner}/${row.priority} edited ${row.lastEdited ?? "?"} by ${row.lastEditedBy ?? "?"} -> ${JSON.stringify(ops)}`);
}
const missing = (db.sqlite.prepare(`SELECT id, status, kind, title FROM tickets WHERE mirror_record_id IS NOT NULL ORDER BY id`).all() as { id: number; status: string; kind: string; title: string }[])
  .filter((t) => !seen.has(db.getTicket(t.id)!.mirror_record_id!));
console.log(`\nrows deleted in Airtable (${missing.length}):`);
for (const t of missing) console.log(`  MOX-${t.id} · ${t.status} · ${t.kind} · ${t.title?.slice(0, 70)}`);
db.close();
