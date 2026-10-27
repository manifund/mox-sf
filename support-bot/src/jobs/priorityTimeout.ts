/**
 * every 30s: unstick `new` tickets. Urgency is captured on the modal now, so there is no
 * button to wait for; this job resolves stale pauses and makes sure nothing sits untriaged (C8).
 */
import type { App } from "../app.js";
import * as actions from "../core/actions.js";
import { ensureTriaged, maybeRoute } from "../core/flow.js";
import { drainManualIntake, drainPendingIntake } from "../handlers/chatIntake.js";
import { drainResyncRequests } from "../core/resync.js";
import { drainDigestRequest } from "./issueDigest.js";
import { minutesSince } from "../util/time.js";

export async function priorityTimeoutJob(app: App): Promise<void> {
  await drainManualIntake(app).catch((err) => app.log.error({ err }, "manual intake drain"));
  await drainPendingIntake(app).catch((err) => app.log.error({ err }, "pending intake drain"));
  await drainResyncRequests(app).catch((err) => app.log.error({ err }, "resync drain"));
  await drainDigestRequest(app).catch((err) => app.log.error({ err }, "digest request"));
  const limitMin = app.cfg.priority_timeout_seconds / 60;
  for (const t of app.db.listNew()) {
    try {
      // duplicate offer unanswered for 3 min -> proceed normally (§8)
      if (t.dupe_offer_of !== null && t.dupe_offered_at && minutesSince(t.dupe_offered_at) >= limitMin) {
        await actions.declineDuplicate(app, t);
        continue;
      }
      // question redirect unanswered for 3 min -> treat as an issue (never drop a ticket)
      if (t.kind === "question" && !t.question_resolved && t.question_asked_at && minutesSince(t.question_asked_at) >= limitMin) {
        await actions.keepAsIssue(app, t);
        continue;
      }
      // the model never answered -> keywords, then route
      if (!t.triaged_at && minutesSince(t.created_at) >= 1) {
        await ensureTriaged(app, t.id);
        await maybeRoute(app, t.id);
        continue;
      }
      // triaged and unpaused but somehow still new (e.g. a crash mid-route) -> route
      if (t.triaged_at && t.dupe_offer_of === null && !(t.kind === "question" && !t.question_resolved) && t.kind !== "idea" && minutesSince(t.triaged_at) >= 1) {
        await maybeRoute(app, t.id);
      }
    } catch (err) {
      app.log.error({ err, ticket: t.id }, "priorityTimeout job failed for ticket");
    }
  }
}
