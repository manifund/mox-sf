/**
 * Airtable mirror (replaces the Notion mirror, spec §3.3). Discord is the only
 * place a ticket changes; Airtable only ever receives writes, through
 * mirror_queue, drained by jobs/mirrorRetry.ts. The live table schema is
 * fetched on boot and the process fails loudly if a field the bot writes is missing.
 *
 * Plain fetch against the REST API — no SDK. Token needs scopes
 * data.records:read, data.records:write, schema.bases:read.
 */
import fs from "node:fs";
import path from "node:path";
import type { Category, Config, OwnerKey, Priority } from "./config.js";
import type { Db, MirrorQueueItem, Ticket } from "./db.js";
import { log } from "./log.js";
import { ticketRef } from "./util/ids.js";
import { threadUrl } from "./render.js";

const API = "https://api.airtable.com/v0";
const CONTENT_API = "https://content.airtable.com/v0";
/** Airtable's uploadAttachment endpoint takes at most 5 MB of base64 content. */
const UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024;

export const OWNER_NAME: Record<OwnerKey, string> = {
  jake: "Jake",
  whit: "Whit",
  carolina: "Carolina",
  robin: "Robin",
  claudio: "Claudio",
  contractors: "Contractors",
  all_staff: "All staff",
  unassigned: "Unassigned",
};

export const PRIORITY_NAME: Record<Priority, string> = { P0: "P0 Urgent", P1: "P1 Important", P2: "P2 No rush", P3: "P3 Idea" };

export const STATUS_NAME: Record<Ticket["status"], string | null> = {
  new: "New",
  routed: "Routed",
  claimed: "Claimed",
  done: "Done",
  "won't_do": "Won't do",
  duplicate: "Duplicate",
  logged: "New",
  not_a_ticket: "Won't do",
};

export const CATEGORY_NAME: Record<Category, string> = {
  safety: "Safety",
  door_codes: "Door codes",
  plumbing: "Plumbing",
  utilities: "Utilities",
  furniture: "Furniture",
  appliance: "Appliance",
  security: "Security",
  stocking: "Stocking",
  cleaning: "Cleaning",
  cosmetic: "Cosmetic",
  events: "Events",
  operations: "Operations",
  space: "Space",
  other: "Other",
};

/** field name -> allowed Airtable field types */
const REQUIRED_FIELDS: Record<string, string[]> = {
  Name: ["singleLineText"],
  "Ticket ID": ["singleLineText"],
  Kind: ["singleSelect"],
  Status: ["singleSelect"],
  Priority: ["singleSelect"],
  "Reported priority": ["singleSelect"],
  "AI assessment": ["singleSelect"],
  Category: ["singleSelect"],
  Owner: ["singleSelect"],
  "Claimed by": ["singleLineText"],
  Reporter: ["singleLineText"],
  Location: ["singleLineText"],
  Summary: ["singleLineText"],
  Description: ["multilineText", "richText"],
  Photos: ["multipleAttachments"],
  "Discord thread": ["url"],
  Visibility: ["singleSelect"],
  Reported: ["dateTime"],
  Claimed: ["dateTime"],
  Closed: ["dateTime"],
  Resolution: ["multilineText", "richText"],
  Source: ["singleSelect"],
};
/** written when present, silently skipped when the field doesn't exist */
const OPTIONAL_FIELDS: Record<string, string[]> = {
  "Routed by": ["singleSelect"],
  "Owner reasoning": ["multilineText", "richText"],
  "Duplicate of": ["multipleRecordLinks"],
  "Discord message": ["url"],
};

const WANT_OPTIONS: Record<string, string[]> = {
  Kind: ["Issue", "Idea"],
  Status: ["New", "Routed", "Claimed", "Done", "Won't do", "Duplicate"],
  Priority: Object.values(PRIORITY_NAME),
  "Reported priority": ["P0 Urgent", "P1 Important", "P2 No rush"],
  "AI assessment": ["P0 Urgent", "P1 Important", "P2 No rush"],
  Category: Object.values(CATEGORY_NAME),
  Owner: Object.values(OWNER_NAME),
  Visibility: ["Private", "Public"],
  Source: ["Discord", "Staff log"],
  "Routed by": ["Category map", "AI judgment"],
};

type Fields = Record<string, unknown>;

interface AirtableField {
  id: string;
  name: string;
  type: string;
  options?: { choices?: { name: string }[] };
}

export interface AirtableRow {
  recordId: string;
  status: string | null;
  kind: string | null;
  priority: string | null;
  owner: string | null;
  resolution: string | null;
  claimedBy: string | null;
  lastEdited: string | null;
  lastEditedBy: string | null;
}

/** A ticket whose Airtable row someone deleted. Its old record id is kept after the prefix for the audit trail. */
export const REMOVED_PREFIX = "removed:";
export const isRemovedInAirtable = (t: { mirror_record_id: string | null }) => !!t.mirror_record_id?.startsWith(REMOVED_PREFIX);

export class AirtableError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class AirtableMirror {
  private readonly token: string | null;
  private readonly baseId: string;
  private readonly tableId: string;
  private hasOptional = new Set<string>();
  schemaOk = false;

  constructor(
    token: string | undefined,
    private readonly cfg: Config,
    private readonly db: Db,
  ) {
    this.token = token || null;
    this.baseId = cfg.airtable.base_id;
    this.tableId = cfg.airtable.table_id;
    if (!this.token) log.warn("Airtable not configured (AIRTABLE_TOKEN missing) — mirror disabled, queue will accumulate");
  }

  get enabled(): boolean {
    return this.token !== null;
  }

  // ─── HTTP ───────────────────────────────────────────────────────────────

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 300);
      try {
        const j = JSON.parse(text) as { error?: { type?: string; message?: string } | string };
        if (typeof j.error === "string") msg = j.error;
        else if (j.error) msg = `${j.error.type ?? ""}: ${j.error.message ?? ""}`;
      } catch {
        /* keep raw */
      }
      throw new AirtableError(res.status, `Airtable ${res.status} — ${msg}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  // ─── schema ─────────────────────────────────────────────────────────────

  /** Fetch the live schema and fail loudly if anything we write is missing. */
  async verifySchema(): Promise<void> {
    if (!this.token) return;
    const meta = await this.request<{ tables: { id: string; name: string; fields: AirtableField[] }[] }>(
      `${API}/meta/bases/${this.baseId}/tables`,
    );
    const table = meta.tables.find((t) => t.id === this.tableId || t.name === this.tableId);
    if (!table) throw new Error(`Airtable table ${this.tableId} not found in base ${this.baseId}`);
    const byName = new Map(table.fields.map((f) => [f.name, f]));
    const problems: string[] = [];
    const checkOptions = (name: string, f: AirtableField) => {
      const wanted = WANT_OPTIONS[name];
      if (!wanted) return;
      const have = new Set((f.options?.choices ?? []).map((c) => c.name));
      for (const w of wanted) if (!have.has(w)) problems.push(`field "${name}" has no option "${w}"`);
    };
    for (const [name, types] of Object.entries(REQUIRED_FIELDS)) {
      const f = byName.get(name);
      if (!f) {
        problems.push(`missing field "${name}" (${types.join("|")})`);
        continue;
      }
      if (!types.includes(f.type)) problems.push(`field "${name}" is ${f.type}, expected ${types.join("|")}`);
      checkOptions(name, f);
    }
    for (const [name, types] of Object.entries(OPTIONAL_FIELDS)) {
      const f = byName.get(name);
      if (!f) continue;
      if (!types.includes(f.type)) {
        problems.push(`field "${name}" is ${f.type}, expected ${types.join("|")}`);
        continue;
      }
      checkOptions(name, f);
      this.hasOptional.add(name);
    }
    if (problems.length) {
      throw new Error(`Airtable schema check failed for ${this.baseId}/${this.tableId}:\n  ${problems.join("\n  ")}`);
    }
    this.schemaOk = true;
    log.info({ table: table.name, optional: [...this.hasOptional] }, "Airtable schema verified");
  }

  // ─── enqueue helpers (sync, never touch the network) ───────────────────

  /** kind = question is never written to the board (§3.3). */
  private writable(t: Ticket): boolean {
    if (t.kind === "question") return false;
    if (isRemovedInAirtable(t)) return false; // someone deleted the row on purpose: never recreate it
    // not_a_ticket rows are never created; an existing row (an undone chat idea) is updated so the board stays honest
    if (t.status === "not_a_ticket") return t.mirror_record_id !== null;
    return true;
  }

  enqueueUpsert(t: Ticket): void {
    if (!this.writable(t)) return;
    this.db.enqueueMirror(t.id, t.mirror_record_id ? "update" : "create", {});
  }

  enqueuePhoto(ticketId: number, photoId: number): void {
    this.db.enqueueMirror(ticketId, "upload_photo", { photoId });
  }

  // ─── field mapping ──────────────────────────────────────────────────────

  /** Pure: the Airtable fields for a ticket. `Photos` is never here — attachments are appended via upload. */
  fields(t: Ticket, opts: { duplicateRecordId?: string | null } = {}): Fields {
    const ref = ticketRef(t.id);
    const status = STATUS_NAME[t.status];
    const f: Fields = {
      Name: `${ref} · ${(t.title ?? t.description).slice(0, 120)}`,
      "Ticket ID": ref,
      Kind: t.kind === "idea" ? "Idea" : "Issue",
      Priority: t.priority ? PRIORITY_NAME[t.priority] : null,
      "Reported priority": t.reported_priority ? PRIORITY_NAME[t.reported_priority] : null,
      "AI assessment": t.assessed_priority ? PRIORITY_NAME[t.assessed_priority] : null,
      Category: t.category ? CATEGORY_NAME[t.category] : null,
      Owner: OWNER_NAME[t.owner_key ?? "unassigned"],
      "Claimed by": t.claimed_by ?? null,
      Reporter: t.reporter_name,
      Location: t.location,
      Summary: t.staff_summary ?? null,
      Description: [t.description, t.context ? `\n\n${t.context}` : ""].join(""),
      "Discord thread": t.thread_id ? threadUrl(this.cfg, t.thread_id) : null,
      Visibility: t.visibility === "public" ? "Public" : "Private",
      Reported: t.created_at,
      Claimed: t.claimed_at ?? null,
      Closed: t.closed_at ?? null,
      Resolution: t.resolution_note ?? t.wont_do_reason ?? (t.duplicate_of ? `Duplicate of ${ticketRef(t.duplicate_of)}` : null),
      Source: t.source === "staff_log" ? "Staff log" : "Discord", // chat intake is still Discord
    };
    if (status) f.Status = status;
    if (this.hasOptional.has("Routed by"))
      f["Routed by"] = t.routed_by === "ai_judgment" ? "AI judgment" : t.routed_by === "category_map" ? "Category map" : null;
    if (this.hasOptional.has("Owner reasoning")) f["Owner reasoning"] = t.routed_by === "ai_judgment" ? t.owner_reasoning : null;
    if (this.hasOptional.has("Duplicate of")) f["Duplicate of"] = opts.duplicateRecordId ? [opts.duplicateRecordId] : [];
    // only ever filled, never cleared, so a link pasted by hand in Airtable survives
    if (this.hasOptional.has("Discord message") && t.source_message_url) f["Discord message"] = t.source_message_url;
    return f;
  }

  /** Test hook: pretend the optional fields exist. */
  assumeOptionalFields(names: string[]): void {
    for (const n of names) this.hasOptional.add(n);
  }

  // ─── queue processing ──────────────────────────────────────────────────

  /** Throws on failure so the drain job can back off. */
  async process(item: MirrorQueueItem): Promise<void> {
    if (!this.token) throw new Error("Airtable not configured");
    const t = this.db.getTicket(item.ticket_id);
    if (!t) return; // ticket vanished; drop silently
    if (!this.writable(t)) return;

    switch (item.op) {
      case "create":
      case "update": {
        const dupRecord = t.duplicate_of ? (this.db.getTicket(t.duplicate_of)?.mirror_record_id ?? null) : null;
        const fields = this.fields(t, { duplicateRecordId: dupRecord });
        if (t.mirror_record_id) {
          try {
            await this.request(`${API}/${this.baseId}/${this.tableId}/${t.mirror_record_id}`, {
              method: "PATCH",
              body: JSON.stringify({ fields }),
            });
          } catch (err) {
            if (err instanceof AirtableError && (err.status === 404 || (err.status === 422 && /does not exist|ROW_DOES_NOT_EXIST|NOT_FOUND/i.test(err.message)))) {
              log.info({ ticket: t.id }, "Airtable row was deleted; skipping the write (the sync will treat it as removed)");
              return;
            }
            throw err;
          }
          this.db.updateTicket(t.id, { mirror_written_at: new Date().toISOString() });
        } else {
          const rec = await this.request<{ id: string }>(`${API}/${this.baseId}/${this.tableId}`, {
            method: "POST",
            body: JSON.stringify({ fields }),
          });
          this.db.updateTicket(t.id, { mirror_record_id: rec.id, mirror_written_at: new Date().toISOString() });
        }
        return;
      }
      case "upload_photo": {
        const { photoId } = JSON.parse(item.payload) as { photoId: number };
        const photo = this.db.getPhoto(photoId);
        if (!photo) return;
        if (photo.mirror_file_id) return; // already attached
        if (!t.mirror_record_id) throw new Error("record not created yet"); // retry later
        if (!fs.existsSync(photo.local_path)) {
          log.error({ photoId }, "buffered photo missing on disk — cannot upload");
          return;
        }
        const bytes = fs.readFileSync(photo.local_path);
        const filename = `${ticketRef(t.id)}-${path.basename(photo.local_path)}`;
        const contentType = photo.content_type ?? "application/octet-stream";
        if (bytes.byteLength <= UPLOAD_LIMIT_BYTES) {
          const res = await this.request<{ fields?: Record<string, { id: string }[]> }>(
            `${CONTENT_API}/${this.baseId}/${t.mirror_record_id}/Photos/uploadAttachment`,
            { method: "POST", body: JSON.stringify({ contentType, filename, file: bytes.toString("base64") }) },
          );
          const attached = res.fields?.Photos?.find((a) => a.id) ?? null;
          this.db.markPhotoUploaded(photo.id, attached?.id ?? `uploaded:${Date.now()}`);
          return;
        }
        // Over the upload limit: let Airtable fetch it from Discord while the signed URL is still fresh (≤24h).
        const ageH = (Date.now() - new Date(item.created_at).getTime()) / 3600000;
        if (ageH > 20) {
          log.error({ photoId, bytes: bytes.byteLength }, "photo too large to upload and Discord URL expired — left in the thread only");
          this.db.markPhotoUploaded(photo.id, "skipped:too-large");
          return;
        }
        const rec = await this.request<{ fields?: { Photos?: { id: string; url: string }[] } }>(
          `${API}/${this.baseId}/${this.tableId}/${t.mirror_record_id}`,
        );
        const existing = (rec.fields?.Photos ?? []).map((a) => ({ id: a.id }));
        await this.request(`${API}/${this.baseId}/${this.tableId}/${t.mirror_record_id}`, {
          method: "PATCH",
          body: JSON.stringify({ fields: { Photos: [...existing, { url: photo.discord_url, filename }] } }),
        });
        this.db.markPhotoUploaded(photo.id, `url:${Date.now()}`);
        return;
      }
    }
  }

  /** Every row's human-editable fields, for the Airtable -> bot sync. */
  async listEditableRows(): Promise<AirtableRow[]> {
    if (!this.token) return [];
    const names = ["Status", "Kind", "Priority", "Owner", "Resolution", "Claimed by", "Last edited", "Last edited by"];
    const rows: AirtableRow[] = [];
    let offset: string | undefined;
    do {
      const qs = new URLSearchParams({ pageSize: "100" });
      for (const n of names) qs.append("fields[]", n);
      if (offset) qs.set("offset", offset);
      const page = await this.request<{ records: { id: string; fields: Record<string, unknown> }[]; offset?: string }>(
        `${API}/${this.baseId}/${this.tableId}?${qs.toString()}`,
      );
      for (const r of page.records) {
        const f = r.fields;
        const by = f["Last edited by"] as { name?: string; email?: string } | undefined;
        rows.push({
          recordId: r.id,
          status: (f.Status as string) ?? null,
          kind: (f.Kind as string) ?? null,
          priority: (f.Priority as string) ?? null,
          owner: (f.Owner as string) ?? null,
          resolution: ((f.Resolution as string) ?? "").trim() || null,
          claimedBy: ((f["Claimed by"] as string) ?? "").trim() || null,
          lastEdited: (f["Last edited"] as string) ?? null,
          lastEditedBy: by?.name ?? by?.email ?? null,
        });
      }
      offset = page.offset;
    } while (offset);
    return rows;
  }

  static describeError(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }
}
