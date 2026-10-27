/**
 * `npm run export-seed` — the one-time database hand-off when moving hosts (docs/DEPLOY.md).
 * Takes a consistent snapshot of the live database and DMs it, as a file, from the bot to the ops user
 * (OPS_ALERT_USER_ID). Prints the file's link to paste into the new host as SEED_DATABASE_URL.
 * Stop the old bot first, so nothing is written after the snapshot.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REST, Routes } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const to = env.OPS_ALERT_USER_ID || cfg.ops.alert_user_id;

const snap = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mox-seed-")), "mox-seed.db");
const live = new Database(env.DATABASE_PATH, { readonly: true, fileMustExist: true });
await live.backup(snap); // consistent copy, WAL included
const tickets = (live.prepare("SELECT COUNT(*) AS n, MAX(id) AS max FROM tickets").get() as { n: number; max: number });
live.close();

const rest = new REST().setToken(env.DISCORD_TOKEN);
const dm = (await rest.post(Routes.userChannels(), { body: { recipient_id: to } })) as { id: string };
const msg = (await rest.post(Routes.channelMessages(dm.id), {
  body: { content: `Database snapshot for the Railway move: ${tickets.n} tickets, last MOX-${tickets.max}. Paste the file link into Railway as SEED_DATABASE_URL, then delete this message once the bot is up there.` },
  files: [{ name: "mox-seed.db", data: fs.readFileSync(snap) }],
})) as { id: string; attachments: { url: string; size: number }[] };
fs.rmSync(path.dirname(snap), { recursive: true, force: true });

const a = msg.attachments[0]!;
console.log(`snapshot: ${tickets.n} tickets, last MOX-${tickets.max}, ${a.size} bytes, sent to your DMs`);
console.log(`\nSEED_DATABASE_URL=${a.url}\n`);
console.log("The link expires in about a day. Use it for the first deploy, then remove the variable.");
