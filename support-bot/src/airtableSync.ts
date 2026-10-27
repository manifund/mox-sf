/**
 * Airtable -> bot. Airtable is a place people work tickets too: a change to Status, Owner, Priority, Kind or
 * Resolution made there is applied through the same actions as a Discord click (reporter told, cards
 * updated, digest current). Echoes are impossible by construction:
 *   - a ticket with a queued bot write is skipped until that write lands;
 *   - a row is acted on only if Airtable says it was edited after the bot last wrote it;
 *   - and even then, only fields whose value differs from the bot's own record produce an action.
 */
import type { App } from "./app.js";
import { OWNER_NAME, PRIORITY_NAME, type AirtableRow } from "./airtable.js";
import type { OwnerKey, Priority } from "./config.js";
import * as actions from "./core/actions.js";
import type { Ticket } from "./db.js";

export type SyncOp =
  | { op: "close" }
  | { op: "wont_do"; reason: string }
  | { op: "claim"; name: string }
  | { op: "unclaim" }
  | { op: "reopen" }
  | { op: "reassign"; owner: OwnerKey }
  | { op: "set_priority"; priority: "P0" | "P1" | "P2" }
  | { op: "to_idea" }
  | { op: "promote"; priority: "P0" | "P1" | "P2"; owner?: OwnerKey }
  | { op: "close_idea" }
  | { op: "decline_idea"; reason: string }
  | { op: "idea_owner"; owner: OwnerKey }
  | { op: "note"; text: string };

const PRIO_BY_NAME = Object.fromEntries(Object.entries(PRIORITY_NAME).map(([k, v]) => [v, k])) as Record<string, Priority>;
const OWNER_BY_NAME = Object.fromEntries(Object.entries(OWNER_NAME).map(([k, v]) => [v, k])) as Record<string, OwnerKey>;
const OPEN = new Set(["New", "Routed", "Claimed"]);

/** Pure: which actions turn the bot's ticket into what Airtable now shows? Empty when they already agree. */
export function planSync(
  t: Pick<Ticket, "status" | "kind" | "priority" | "owner_key" | "resolution_note" | "wont_do_reason">,
  row: Pick<AirtableRow, "status" | "kind" | "priority" | "owner" | "resolution" | "claimedBy">,
  validOwners: string[],
  editor: string,
): SyncOp[] {
  const ownerKey = (name: string | null) => {
    const k = name ? OWNER_BY_NAME[name] : undefined;
    return k && k !== "unassigned" && validOwners.includes(k) ? k : undefined;
  };
  const prio = (name: string | null) => (name ? PRIO_BY_NAME[name] : undefined);
  const workPrio = (name: string | null) => {
    const p = prio(name);
    return p && p !== "P3" ? p : undefined;
  };
  const isIdea = t.status === "logged";
  const isOpen = t.status === "routed" || t.status === "claimed";
  const kindNow = t.kind === "idea" ? "Idea" : "Issue";

  // Kind flips first: they change everything else
  if (row.kind && row.kind !== kindNow) {
    if (row.kind === "Idea" && isOpen) return [{ op: "to_idea" }];
    if (row.kind === "Issue" && isIdea) return [{ op: "promote", priority: workPrio(row.priority) ?? "P2", owner: ownerKey(row.owner) }];
    return [];
  }

  if (isIdea) {
    if (row.status === "Done") return [{ op: "close_idea" }];
    if (row.status === "Won't do") return [{ op: "decline_idea", reason: row.resolution ?? `Declined in Airtable by ${editor}` }];
    // a work priority promotes it; an owner alone just says who's looking after the idea
    const p = workPrio(row.priority);
    if (p) return [{ op: "promote", priority: p, owner: ownerKey(row.owner) }];
    const o = row.owner === OWNER_NAME.unassigned ? "unassigned" : ownerKey(row.owner);
    if (o && o !== (t.owner_key ?? "unassigned")) return [{ op: "idea_owner", owner: o }];
    return [];
  }

  if (isOpen) {
    if (row.status === "Done") return [{ op: "close" }, ...(row.resolution && row.resolution !== t.resolution_note ? [{ op: "note" as const, text: row.resolution }] : [])];
    if (row.status === "Won't do") return [{ op: "wont_do", reason: row.resolution ?? `Closed in Airtable by ${editor}` }];
    const ops: SyncOp[] = [];
    if (row.status === "Claimed" && t.status === "routed") ops.push({ op: "claim", name: row.claimedBy ?? editor });
    if ((row.status === "Routed" || row.status === "New") && t.status === "claimed") ops.push({ op: "unclaim" });
    if (row.priority && row.priority !== (t.priority ? PRIORITY_NAME[t.priority] : null)) {
      const p = prio(row.priority);
      if (p === "P3") return [{ op: "to_idea" }];
      if (p) ops.push({ op: "set_priority", priority: p });
    }
    const o = ownerKey(row.owner);
    if (o && o !== t.owner_key) ops.push({ op: "reassign", owner: o });
    return ops;
  }

  if (t.status === "done") {
    if (row.status && OPEN.has(row.status)) return [{ op: "reopen" }];
    if (row.resolution && row.resolution !== (t.resolution_note ?? null)) return [{ op: "note", text: row.resolution }];
  }
  return [];
}

/**
 * Pure: which known tickets lost their Airtable row? Refuses (returns null) when the answer looks like a
 * broken read rather than people deleting rows: an empty table, or more removals at once than `maxAtOnce`.
 */
export function planRemovals(known: { id: number; recordId: string }[], seenRecordIds: Set<string>, maxAtOnce: number): number[] | null {
  if (seenRecordIds.size === 0 && known.length > 0) return null;
  const gone = known.filter((k) => !seenRecordIds.has(k.recordId)).map((k) => k.id);
  return gone.length > maxAtOnce ? null : gone;
}

let running = false;

/** Pull every row once and apply people's edits. Safe to call any time; overlapping calls are skipped. */
export async function syncFromAirtable(app: App): Promise<{ applied: number }> {
  if (running || !app.mirror.enabled) return { applied: 0 };
  running = true;
  let applied = 0;
  try {
    const rows = await app.mirror.listEditableRows();

    // Rows people deleted: close those tickets quietly (unless this looks like a broken read)
    const known = app.db.ticketsWithMirrorRecord().map((t) => ({ id: t.id, recordId: t.mirror_record_id! }));
    const gone = planRemovals(known, new Set(rows.map((r) => r.recordId)), app.cfg.airtable.max_removals_per_sync);
    if (gone === null) {
      await app.ops.send("airtable_mass_removal", `Airtable sync paused removals: ${known.length - rows.length} rows look deleted at once (or the table read came back empty). Nothing was closed. Check the Tickets table.`);
    } else {
      for (const id of gone) {
        const t = app.db.getTicket(id);
        if (!t) continue;
        await actions.removeFromAirtable(app, t);
        app.log.info({ ticket: id }, "row deleted in Airtable: ticket removed");
        applied++;
      }
    }

    for (const row of rows) {
      const t = app.db.getTicketByMirrorRecord(row.recordId);
      if (!t) continue;
      if (app.db.hasPendingMirrorWrite(t.id)) continue; // our own write hasn't landed yet
      if (!row.lastEdited) continue;
      if (t.mirror_written_at && new Date(row.lastEdited).getTime() <= new Date(t.mirror_written_at).getTime()) continue; // nothing newer than our write
      const editor = row.lastEditedBy ?? "someone in Airtable";
      const ops = planSync(t, row, Object.keys(app.cfg.owners), editor);
      // nothing to do, or only things we can't apply: record the read so it isn't reconsidered every minute
      if (!ops.length) {
        app.db.updateTicket(t.id, { mirror_written_at: row.lastEdited });
        continue;
      }
      const by = { id: "airtable", name: editor };
      for (const op of ops) {
        const cur = app.db.getTicket(t.id)!;
        switch (op.op) {
          case "close": await actions.close(app, cur, by); break;
          case "wont_do": await actions.wontDo(app, cur, op.reason, by); break;
          case "claim": await actions.claim(app, cur, { id: "airtable", name: op.name }); break;
          case "unclaim": await actions.unclaim(app, cur, by); break;
          case "reopen": await actions.reopen(app, cur, `reopened in Airtable by ${editor}`); break;
          case "reassign": await actions.reassign(app, cur, op.owner, by); break;
          case "set_priority": await actions.setPriority(app, cur, op.priority, by); break;
          case "to_idea": await actions.moveToIdeas(app, cur, by); break;
          case "promote": await actions.promoteIdea(app, cur, { priority: op.priority, ownerKey: op.owner }, by); break;
          case "close_idea": await actions.closeIdea(app, cur, by); break;
          case "decline_idea": await actions.declineIdea(app, cur, op.reason, by); break;
          case "idea_owner": await actions.setIdeaOwner(app, cur, op.owner, by); break;
          case "note": await actions.saveResolutionNote(app, cur, op.text); break;
        }
      }
      app.db.recordEvent(t.id, "airtable_edit", editor, null, ops);
      app.log.info({ ticket: t.id, editor, ops }, "applied an Airtable edit");
      applied++;
    }
  } catch (err) {
    app.log.warn({ err: err instanceof Error ? err.message : err }, "Airtable sync failed; will retry");
  } finally {
    running = false;
  }
  return { applied };
}
