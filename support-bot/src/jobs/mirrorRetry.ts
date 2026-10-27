/** every 60s — drain mirror_queue with exponential backoff; 8th failure -> ops alert (§3.2, §9.2). */
import type { App } from "../app.js";
import { AirtableMirror } from "../airtable.js";
import { opsMirrorBacklog, opsMirrorFailed } from "../render.js";

const MAX_ATTEMPTS = 8;

export async function mirrorRetryJob(app: App): Promise<void> {
  if (!app.mirror.enabled) return;
  const items = app.db.dueMirrorItems(25);
  // collapse duplicate create/update ops for the same ticket — the latest state is what gets written
  const seen = new Set<number>();
  for (const item of items) {
    if (item.op !== "upload_photo") {
      if (seen.has(item.ticket_id)) {
        app.db.completeMirrorItem(item.id);
        continue;
      }
      seen.add(item.ticket_id);
    }
    try {
      await app.mirror.process(item);
      app.db.completeMirrorItem(item.id);
    } catch (err) {
      const msg = AirtableMirror.describeError(err);
      const attempts = item.attempts + 1;
      const delayMs = Math.min(60_000 * 2 ** (attempts - 1), 6 * 3600_000);
      app.db.failMirrorItem(item.id, msg, new Date(Date.now() + delayMs).toISOString());
      app.log.warn({ item: item.id, ticket: item.ticket_id, op: item.op, attempts, msg }, "airtable op failed");
      if (attempts >= MAX_ATTEMPTS) {
        await app.ops.send(`mirror_failed_${item.ticket_id}`, opsMirrorFailed(item.ticket_id, msg));
      }
    }
  }
  const depth = app.db.mirrorQueueDepth();
  if (depth > 10 && app.db.mirrorQueueOldestMinutes() > 10) await app.ops.send("mirror_backlog", opsMirrorBacklog(depth)); // stuck, not just a burst
}
