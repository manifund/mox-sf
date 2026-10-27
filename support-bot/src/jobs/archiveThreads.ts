/** hourly — done > 24h -> archive + lock; logged > 1h -> archive (§9). */
import type { App } from "../app.js";
import { archiveThread } from "../core/flow.js";
import { minutesSince } from "../util/time.js";

const KEY = (id: number) => `archived:${id}`;

export async function archiveThreadsJob(app: App): Promise<void> {
  const done = app.db.listByStatus(["done", "won't_do", "duplicate"]);
  for (const t of done) {
    if (!t.closed_at || !t.thread_id || app.db.kvGet(KEY(t.id))) continue;
    if (minutesSince(t.closed_at) < 24 * 60) continue;
    await archiveThread(app, t, true);
    app.db.kvSet(KEY(t.id), "1");
  }
  for (const t of app.db.listLogged()) {
    if (!t.thread_id || app.db.kvGet(KEY(t.id))) continue;
    if (minutesSince(t.updated_at) < 60) continue;
    await archiveThread(app, t, false);
    app.db.kvSet(KEY(t.id), "1");
  }
}
