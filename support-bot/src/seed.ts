/**
 * Moving hosts must never start the bot on an empty database: ticket numbers would restart at
 * MOX-100, every existing card and digest line would be orphaned, and the pinned post would be
 * posted again. So on boot:
 *   - database exists                -> use it
 *   - SEED_DATABASE_URL set          -> download it once (must be a real SQLite file), then use it
 *   - ALLOW_FRESH_DATABASE=true      -> start empty on purpose (a brand-new install)
 *   - otherwise                      -> refuse to start, saying exactly why
 */
import fs from "node:fs";
import path from "node:path";
import { ConfigError } from "./config.js";

const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "latin1");

export type SeedOutcome = "existing" | "seeded" | "fresh";

export async function ensureDatabase(opts: { dbPath: string; seedUrl?: string; allowFresh: boolean }): Promise<SeedOutcome> {
  if (opts.dbPath === ":memory:" || fs.existsSync(opts.dbPath)) return "existing";
  if (opts.seedUrl) {
    const res = await fetch(opts.seedUrl);
    if (!res.ok) throw new ConfigError(`SEED_DATABASE_URL download failed: HTTP ${res.status}. The link may have expired; make a new one.`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER))
      throw new ConfigError("SEED_DATABASE_URL did not return a SQLite database. Refusing to start on it.");
    fs.mkdirSync(path.dirname(path.resolve(opts.dbPath)), { recursive: true });
    const tmp = `${opts.dbPath}.seeding`;
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, opts.dbPath); // atomic: a crash mid-download never leaves a half database behind
    return "seeded";
  }
  if (opts.allowFresh) return "fresh";
  throw new ConfigError(
    `No database at ${opts.dbPath}. Starting empty would restart ticket numbering and orphan every existing card.\n` +
      "  Moving hosts? Set SEED_DATABASE_URL to a copy of the current database (see docs/DEPLOY.md).\n" +
      "  Brand-new install? Set ALLOW_FRESH_DATABASE=true.",
  );
}
