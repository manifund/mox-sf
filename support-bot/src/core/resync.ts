/**
 * `resync_request:<ticketId>` in kv asks the running bot to bring every surface of a ticket back in
 * line with SQLite: ticket thread name, cards (open or collapsed), the #ask-staff confirmation thread,
 * and the Airtable row. Used after bulk edits (e.g. restoring reporters' own wording).
 */
import type { App } from "../app.js";
import { refreshSurfaces } from "../cards.js";
import { fetchThread } from "../discord.js";
import { ticketRef } from "../util/ids.js";
import { moveToIdeas } from "./actions.js";

export const RESYNC_PREFIX = "resync_request:";

async function rename(app: App, threadId: string | null | undefined, name: string): Promise<void> {
  if (!threadId) return;
  const th = await fetchThread(app.client, threadId);
  if (!th || th.name === name) return;
  const wasArchived = th.archived;
  try {
    if (wasArchived) await th.setArchived(false);
    await th.setName(name);
    if (wasArchived) await th.setArchived(true);
  } catch (err) {
    app.log.warn({ err, threadId }, "resync: rename failed");
  }
}

/** `to_idea_request:<ticketId>` = actor name: move open work to the ideas list (staff decision relayed). */
export const TO_IDEA_PREFIX = "to_idea_request:";

export async function drainResyncRequests(app: App): Promise<void> {
  for (const { key, value } of app.db.kvList(TO_IDEA_PREFIX)) {
    app.db.kvDel(key);
    const t = app.db.getTicket(Number(key.slice(TO_IDEA_PREFIX.length)));
    if (t) await moveToIdeas(app, t, { id: "relay", name: value || "staff" });
  }
  for (const { key } of app.db.kvList(RESYNC_PREFIX)) {
    app.db.kvDel(key);
    const t = app.db.getTicket(Number(key.slice(RESYNC_PREFIX.length)));
    if (!t) continue;
    const name = `${ticketRef(t.id)} · ${t.title ?? ""}`.slice(0, 100);
    await rename(app, t.thread_id, name);
    const confirm = app.db.kvGet(`chat_reply:${t.id}`)?.split(":")[0];
    if (confirm && confirm !== t.thread_id) await rename(app, confirm, name);
    await refreshSurfaces(app, t.id);
    app.mirror.enqueueUpsert(t);
    app.log.info({ ticket: t.id }, "resynced");
  }
}
