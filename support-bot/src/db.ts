/**
 * SQLite access. One connection, WAL mode, synchronous statements.
 * A SQLite write must never block on an Airtable call (§3.2) — nothing here is async.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Category, Kind, OwnerKey, Priority } from "./config.js";
import { nowIso } from "./util/time.js";

export type Status =
  | "new"
  | "routed"
  | "claimed"
  | "done"
  | "won't_do"
  | "duplicate"
  | "not_a_ticket"
  | "logged";

export const OPEN_STATUSES: Status[] = ["routed", "claimed"];
export const CLOSED_STATUSES: Status[] = ["done", "won't_do", "duplicate"];

export type PrioritySource =
  | "reporter"
  | "timeout"
  | "ai_escalation"
  | "safety"
  | "idea"
  | "staff_override"
  | "staff_log"
  | "ai_assessment"
  | "default";

export interface Ticket {
  id: number;
  created_at: string;
  updated_at: string;
  routed_at: string | null;
  claimed_at: string | null;
  closed_at: string | null;
  reporter_id: string | null;
  reporter_name: string;
  source: "discord" | "web" | "staff_log" | "chat";
  contact_kind: "discord" | "email" | "phone";
  contact_value: string | null;
  description: string;
  location: string;
  context: string | null;
  kind: Kind | null;
  title: string | null;
  staff_summary: string | null;
  category: Category | null;
  assessed_priority: "P0" | "P1" | "P2" | null;
  suggested_owner: string | null;
  owner_reasoning: string | null;
  routed_by: "category_map" | "ai_judgment" | null;
  triage_method: "ai" | "keywords" | null;
  triage_confidence: number | null;
  triage_reasoning: string | null;
  triaged_at: string | null;
  reported_priority: "P0" | "P1" | "P2" | null;
  priority: Priority | null;
  priority_source: PrioritySource | null;
  owner_key: OwnerKey | null;
  status: Status;
  visibility: "private" | "public";
  visibility_source: "reporter_at_report" | "reporter_later" | "staff" | null;
  made_public_at: string | null;
  made_public_by: string | null;
  mirror_channel_id: string | null;
  mirror_message_id: string | null;
  thread_id: string | null;
  card_channel_id: string | null;
  card_message_id: string | null;
  mirror_record_id: string | null;
  claimed_by: string | null;
  closed_by: string | null;
  resolution_note: string | null;
  wont_do_reason: string | null;
  duplicate_of: number | null;
  reopen_count: number;
  nudged_at: string | null;
  escalated_at: string | null;
  dupe_offer_of: number | null;
  dupe_offered_at: string | null;
  question_asked_at: string | null;
  question_resolved: number;
  minutes_spent: number | null;
  closed_note_until: string | null;
  redirect_miss: number;
  reporter_told_claim: string | null;
  source_message_url: string | null;
  digest_summary: string | null;
  mirror_written_at: string | null;
}

export interface Surface {
  ticket_id: number;
  /** digest = one reactable line in an issue digest; edited live like the cards */
  kind: "thread" | "channel" | "mirror" | "digest";
  channel_id: string;
  message_id: string;
}

export interface Photo {
  id: number;
  ticket_id: number;
  discord_url: string;
  local_path: string;
  content_type: string | null;
  mirror_file_id: string | null;
  uploaded_at: string | null;
}

export interface MirrorQueueItem {
  id: number;
  ticket_id: number;
  op: "create" | "update" | "upload_photo";
  payload: string;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string | null;
  created_at: string;
}

export interface TicketEvent {
  id: number;
  ticket_id: number;
  at: string;
  type: string;
  actor: string | null;
  before: string | null;
  after: string | null;
}

const TICKET_COLUMNS = new Set<string>([
  "routed_at", "claimed_at", "closed_at", "reporter_id", "reporter_name", "source", "contact_kind",
  "contact_value", "description", "location", "context", "kind", "title", "staff_summary", "category",
  "assessed_priority", "suggested_owner", "owner_reasoning", "routed_by", "triage_method",
  "triage_confidence", "triage_reasoning", "triaged_at", "reported_priority", "priority",
  "priority_source", "owner_key", "status", "visibility", "visibility_source", "made_public_at",
  "made_public_by", "mirror_channel_id", "mirror_message_id", "thread_id", "card_channel_id",
  "card_message_id", "mirror_record_id", "claimed_by", "closed_by", "resolution_note", "wont_do_reason",
  "duplicate_of", "reopen_count", "nudged_at", "escalated_at", "dupe_offer_of", "dupe_offered_at",
  "question_asked_at", "question_resolved", "minutes_spent", "closed_note_until", "redirect_miss",
  "reporter_told_claim", "source_message_url", "digest_summary", "mirror_written_at",
]);

export type TicketPatch = Partial<Omit<Ticket, "id" | "created_at" | "updated_at">>;

export interface NewTicketRow {
  reporter_id: string | null;
  reporter_name: string;
  source: Ticket["source"];
  contact_kind: Ticket["contact_kind"];
  contact_value: string | null;
  description: string;
  location: string;
  context: string | null;
  visibility: Ticket["visibility"];
  visibility_source: Ticket["visibility_source"];
  status: Status;
  created_at?: string;
}

export class Db {
  readonly sqlite: Database.Database;

  constructor(dbPath: string, firstTicketNumber: number) {
    if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    this.sqlite = new Database(dbPath);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.migrate();
    this.seedSequence(firstTicketNumber);
  }

  private migrate(): void {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(here, "../migrations"),
      path.resolve(here, "../../migrations"),
      path.resolve(process.cwd(), "migrations"),
    ];
    const dir = candidates.find((d) => fs.existsSync(d));
    if (!dir) throw new Error("migrations/ directory not found");
    this.sqlite.exec(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
    const applied = new Set(
      (this.sqlite.prepare(`SELECT name FROM _migrations`).all() as { name: string }[]).map((r) => r.name),
    );
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (applied.has(f)) continue;
      const sql = fs.readFileSync(path.join(dir, f), "utf8");
      this.sqlite.transaction(() => {
        this.sqlite.exec(sql);
        this.sqlite.prepare(`INSERT INTO _migrations (name, applied_at) VALUES (?, ?)`).run(f, nowIso());
      })();
    }
  }

  /** Real numbering starts at MOX-100 (spec §3.3). */
  private seedSequence(first: number): void {
    const count = (this.sqlite.prepare(`SELECT COUNT(*) AS n FROM tickets`).get() as { n: number }).n;
    if (count > 0) return;
    const row = this.sqlite.prepare(`SELECT seq FROM sqlite_sequence WHERE name = 'tickets'`).get() as
      | { seq: number }
      | undefined;
    if (!row) this.sqlite.prepare(`INSERT INTO sqlite_sequence (name, seq) VALUES ('tickets', ?)`).run(first - 1);
    else if (row.seq < first - 1)
      this.sqlite.prepare(`UPDATE sqlite_sequence SET seq = ? WHERE name = 'tickets'`).run(first - 1);
  }

  // ─── tickets ────────────────────────────────────────────────────────────

  insertTicket(row: NewTicketRow): Ticket {
    const now = row.created_at ?? nowIso();
    const info = this.sqlite
      .prepare(
        `INSERT INTO tickets (created_at, updated_at, reporter_id, reporter_name, source, contact_kind,
           contact_value, description, location, context, visibility, visibility_source, status)
         VALUES (@created_at, @updated_at, @reporter_id, @reporter_name, @source, @contact_kind,
           @contact_value, @description, @location, @context, @visibility, @visibility_source, @status)`,
      )
      .run({ ...row, created_at: now, updated_at: now });
    return this.getTicket(Number(info.lastInsertRowid))!;
  }

  getTicket(id: number): Ticket | undefined {
    return this.sqlite.prepare(`SELECT * FROM tickets WHERE id = ?`).get(id) as Ticket | undefined;
  }

  getTicketByThread(threadId: string): Ticket | undefined {
    return this.sqlite.prepare(`SELECT * FROM tickets WHERE thread_id = ?`).get(threadId) as Ticket | undefined;
  }

  getTicketByMessage(messageId: string): Ticket | undefined {
    const viaSurface = this.sqlite
      .prepare(
        `SELECT t.* FROM tickets t JOIN ticket_surfaces s ON s.ticket_id = t.id WHERE s.message_id = ? LIMIT 1`,
      )
      .get(messageId) as Ticket | undefined;
    if (viaSurface) return viaSurface;
    return this.sqlite.prepare(`SELECT * FROM tickets WHERE card_message_id = ? OR mirror_message_id = ?`).get(
      messageId,
      messageId,
    ) as Ticket | undefined;
  }

  updateTicket(id: number, patch: TicketPatch): Ticket {
    const keys = Object.keys(patch).filter((k) => TICKET_COLUMNS.has(k));
    if (keys.length === 0) return this.getTicket(id)!;
    const sets = keys.map((k) => `${k} = @${k}`).join(", ");
    this.sqlite
      .prepare(`UPDATE tickets SET ${sets}, updated_at = @updated_at WHERE id = @id`)
      .run({ ...(patch as Record<string, unknown>), updated_at: nowIso(), id });
    return this.getTicket(id)!;
  }

  listByStatus(statuses: Status[]): Ticket[] {
    const q = statuses.map(() => "?").join(",");
    return this.sqlite.prepare(`SELECT * FROM tickets WHERE status IN (${q}) ORDER BY id ASC`).all(...statuses) as Ticket[];
  }

  /** Open issues for the queue, dedupe context, digests. */
  listOpen(): Ticket[] {
    return this.listByStatus(OPEN_STATUSES);
  }

  listNew(): Ticket[] {
    return this.listByStatus(["new"]);
  }

  listLogged(): Ticket[] {
    return this.listByStatus(["logged"]);
  }

  listClosedSince(iso: string): Ticket[] {
    return this.sqlite
      .prepare(`SELECT * FROM tickets WHERE closed_at >= ? AND status IN ('done','won''t_do','duplicate') ORDER BY closed_at`)
      .all(iso) as Ticket[];
  }

  listCreatedSince(iso: string): Ticket[] {
    return this.sqlite.prepare(`SELECT * FROM tickets WHERE created_at >= ? ORDER BY id`).all(iso) as Ticket[];
  }

  countClosedSince(iso: string): number {
    return (
      this.sqlite
        .prepare(`SELECT COUNT(*) AS n FROM tickets WHERE closed_at >= ? AND status = 'done'`)
        .get(iso) as { n: number }
    ).n;
  }

  countLoggedThisWeekBy(userId: string, sinceIso: string): number {
    return (
      this.sqlite
        .prepare(`SELECT COUNT(*) AS n FROM tickets WHERE source = 'staff_log' AND closed_by = ? AND created_at >= ?`)
        .get(userId, sinceIso) as { n: number }
    ).n;
  }

  // ─── surfaces ───────────────────────────────────────────────────────────

  addSurface(s: Surface): void {
    this.sqlite
      .prepare(
        `INSERT OR IGNORE INTO ticket_surfaces (ticket_id, kind, channel_id, message_id) VALUES (?, ?, ?, ?)`,
      )
      .run(s.ticket_id, s.kind, s.channel_id, s.message_id);
  }

  surfaces(ticketId: number): Surface[] {
    return this.sqlite.prepare(`SELECT * FROM ticket_surfaces WHERE ticket_id = ?`).all(ticketId) as Surface[];
  }

  removeSurface(messageId: string): void {
    this.sqlite.prepare(`DELETE FROM ticket_surfaces WHERE message_id = ?`).run(messageId);
  }

  // ─── photos ─────────────────────────────────────────────────────────────

  addPhoto(p: Omit<Photo, "id" | "mirror_file_id" | "uploaded_at">): Photo {
    const info = this.sqlite
      .prepare(`INSERT INTO photos (ticket_id, discord_url, local_path, content_type) VALUES (?, ?, ?, ?)`)
      .run(p.ticket_id, p.discord_url, p.local_path, p.content_type);
    return this.sqlite.prepare(`SELECT * FROM photos WHERE id = ?`).get(Number(info.lastInsertRowid)) as Photo;
  }

  photos(ticketId: number): Photo[] {
    return this.sqlite.prepare(`SELECT * FROM photos WHERE ticket_id = ? ORDER BY id`).all(ticketId) as Photo[];
  }

  getPhoto(id: number): Photo | undefined {
    return this.sqlite.prepare(`SELECT * FROM photos WHERE id = ?`).get(id) as Photo | undefined;
  }

  markPhotoUploaded(id: number, mirrorFileId: string): void {
    this.sqlite.prepare(`UPDATE photos SET mirror_file_id = ?, uploaded_at = ? WHERE id = ?`).run(mirrorFileId, nowIso(), id);
  }

  // ─── watchers ───────────────────────────────────────────────────────────

  addWatcher(ticketId: number, userId: string, threadId: string | null): void {
    this.sqlite
      .prepare(`INSERT OR IGNORE INTO watchers (ticket_id, user_id, thread_id) VALUES (?, ?, ?)`)
      .run(ticketId, userId, threadId);
  }

  watchers(ticketId: number): { user_id: string; thread_id: string | null }[] {
    return this.sqlite.prepare(`SELECT user_id, thread_id FROM watchers WHERE ticket_id = ?`).all(ticketId) as {
      user_id: string;
      thread_id: string | null;
    }[];
  }

  // ─── mirror queue (Airtable) ────────────────────────────────────────────

  enqueueMirror(ticketId: number, op: MirrorQueueItem["op"], payload: unknown): void {
    this.sqlite
      .prepare(`INSERT INTO mirror_queue (ticket_id, op, payload, created_at) VALUES (?, ?, ?, ?)`)
      .run(ticketId, op, JSON.stringify(payload ?? {}), nowIso());
  }

  dueMirrorItems(limit = 25): MirrorQueueItem[] {
    return this.sqlite
      .prepare(
        `SELECT * FROM mirror_queue WHERE (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY id ASC LIMIT ?`,
      )
      .all(nowIso(), limit) as MirrorQueueItem[];
  }

  /** minutes the oldest waiting Airtable write has been queued (0 when empty) */
  mirrorQueueOldestMinutes(): number {
    const row = this.sqlite.prepare(`SELECT MIN(created_at) AS oldest FROM mirror_queue`).get() as { oldest: string | null };
    return row.oldest ? (Date.now() - new Date(row.oldest).getTime()) / 60000 : 0;
  }

  /** a create/update for this ticket is still waiting to be written to Airtable */
  hasPendingMirrorWrite(ticketId: number): boolean {
    return !!this.sqlite.prepare(`SELECT 1 FROM mirror_queue WHERE ticket_id = ? AND op IN ('create','update') LIMIT 1`).get(ticketId);
  }

  /** tickets that currently have a live Airtable row */
  ticketsWithMirrorRecord(): Ticket[] {
    return this.sqlite.prepare(`SELECT * FROM tickets WHERE mirror_record_id IS NOT NULL AND mirror_record_id NOT LIKE 'removed:%'`).all() as Ticket[];
  }

  dropMirrorQueue(ticketId: number): void {
    this.sqlite.prepare(`DELETE FROM mirror_queue WHERE ticket_id = ?`).run(ticketId);
  }

  getTicketByMirrorRecord(recordId: string): Ticket | undefined {
    return this.sqlite.prepare(`SELECT * FROM tickets WHERE mirror_record_id = ?`).get(recordId) as Ticket | undefined;
  }

  mirrorQueueDepth(): number {
    return (this.sqlite.prepare(`SELECT COUNT(*) AS n FROM mirror_queue`).get() as { n: number }).n;
  }

  completeMirrorItem(id: number): void {
    this.sqlite.prepare(`DELETE FROM mirror_queue WHERE id = ?`).run(id);
  }

  failMirrorItem(id: number, error: string, nextAttemptIso: string): number {
    this.sqlite
      .prepare(`UPDATE mirror_queue SET attempts = attempts + 1, last_error = ?, next_attempt_at = ? WHERE id = ?`)
      .run(error.slice(0, 500), nextAttemptIso, id);
    return (this.sqlite.prepare(`SELECT attempts FROM mirror_queue WHERE id = ?`).get(id) as { attempts: number }).attempts;
  }

  // ─── nudges ─────────────────────────────────────────────────────────────

  nudgeSent(ticketId: number, rule: string): boolean {
    return !!this.sqlite.prepare(`SELECT 1 FROM nudges WHERE ticket_id = ? AND rule = ?`).get(ticketId, rule);
  }

  recordNudge(ticketId: number, rule: string): void {
    this.sqlite.prepare(`INSERT OR IGNORE INTO nudges (ticket_id, rule, sent_at) VALUES (?, ?, ?)`).run(ticketId, rule, nowIso());
  }

  // ─── kv ─────────────────────────────────────────────────────────────────

  kvGet(key: string): string | undefined {
    return (this.sqlite.prepare(`SELECT value FROM kv WHERE key = ?`).get(key) as { value: string } | undefined)?.value;
  }

  kvSet(key: string, value: string): void {
    this.sqlite.prepare(`INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
  }

  kvList(prefix: string): { key: string; value: string }[] {
    return this.sqlite.prepare(`SELECT key, value FROM kv WHERE key LIKE ? ORDER BY key`).all(`${prefix}%`) as { key: string; value: string }[];
  }

  kvDel(key: string): void {
    this.sqlite.prepare(`DELETE FROM kv WHERE key = ?`).run(key);
  }

  // ─── events ─────────────────────────────────────────────────────────────

  recordEvent(ticketId: number, type: string, actor: string | null, before?: unknown, after?: unknown): void {
    this.sqlite
      .prepare(`INSERT INTO events (ticket_id, at, type, actor, before, after) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(
        ticketId,
        nowIso(),
        type,
        actor,
        before === undefined ? null : JSON.stringify(before),
        after === undefined ? null : JSON.stringify(after),
      );
  }

  countEventsSince(type: string, sinceIso: string): number {
    return (
      this.sqlite.prepare(`SELECT COUNT(*) AS n FROM events WHERE type = ? AND at >= ?`).get(type, sinceIso) as { n: number }
    ).n;
  }

  close(): void {
    this.sqlite.close();
  }
}
