import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { ensureDatabase } from "../src/seed.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "mox-seed-"));
function sqliteDataUrl(): string {
  const f = path.join(tmp(), "src.db");
  const d = new Database(f);
  d.exec("CREATE TABLE t (x); INSERT INTO t VALUES (42);");
  d.close();
  return `data:application/octet-stream;base64,${fs.readFileSync(f).toString("base64")}`;
}

describe("never start on an empty database by accident", () => {
  it("uses an existing database untouched", async () => {
    const p = path.join(tmp(), "mox.db");
    fs.writeFileSync(p, "x");
    expect(await ensureDatabase({ dbPath: p, allowFresh: false })).toBe("existing");
  });
  it("refuses to start with no database, no seed and no explicit go-ahead", async () => {
    await expect(ensureDatabase({ dbPath: path.join(tmp(), "mox.db"), allowFresh: false })).rejects.toThrow(/restart ticket numbering/);
  });
  it("seeds from a real SQLite file, then that database is the one in use", async () => {
    const p = path.join(tmp(), "nested", "mox.db");
    expect(await ensureDatabase({ dbPath: p, seedUrl: sqliteDataUrl(), allowFresh: false })).toBe("seeded");
    const d = new Database(p);
    expect(d.prepare("SELECT x FROM t").get()).toEqual({ x: 42 });
    d.close();
    expect(await ensureDatabase({ dbPath: p, seedUrl: "data:,ignored", allowFresh: false })).toBe("existing"); // never re-seeds
  });
  it("refuses a seed that isn't a SQLite database", async () => {
    await expect(ensureDatabase({ dbPath: path.join(tmp(), "mox.db"), seedUrl: "data:text/plain,hello", allowFresh: false })).rejects.toThrow(/not return a SQLite/);
  });
  it("an explicit go-ahead allows a brand-new install", async () => {
    expect(await ensureDatabase({ dbPath: path.join(tmp(), "mox.db"), allowFresh: true })).toBe("fresh");
  });
});
