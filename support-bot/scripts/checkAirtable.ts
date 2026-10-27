/** `npx tsx scripts/checkAirtable.ts` — verifies AIRTABLE_TOKEN against the live table schema, no writes. */
import { AirtableMirror } from "../src/airtable.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { Db } from "../src/db.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const db = new Db(":memory:", cfg.airtable.first_ticket_number);
const m = new AirtableMirror(env.AIRTABLE_TOKEN, cfg, db);
if (!m.enabled) {
  console.log("AIRTABLE_TOKEN blank — nothing to check");
  process.exit(0);
}
try {
  await m.verifySchema();
  console.log(`✓ Airtable schema OK — ${cfg.airtable.base_id}/${cfg.airtable.table_id}`);
} catch (err) {
  console.error(`✖ ${(err as Error).message}`);
  process.exit(1);
}
