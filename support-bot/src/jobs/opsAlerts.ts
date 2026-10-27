/** every 5 min — anything that isn't caught inline (§9.2). */
import type { App } from "../app.js";
import { opsKeywordFallback, opsMirrorBacklog } from "../render.js";

export async function opsAlertsJob(app: App): Promise<void> {
  // while Airtable is deliberately unconfigured the queue is expected to grow — no alert
  const depth = app.db.mirrorQueueDepth();
  if (app.mirror.enabled && depth > 10 && app.db.mirrorQueueOldestMinutes() > 10) await app.ops.send("mirror_backlog", opsMirrorBacklog(depth));
  if (app.triage.consecutiveFallbacks >= 5) await app.ops.send("keyword_fallback", opsKeywordFallback());
}
