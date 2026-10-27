/** every 5 min — one nudge per ticket per rule, ever (§7.5.2, §9.1). */
import type { App } from "../app.js";
import { fetchMessage } from "../discord.js";
import { dmUser } from "../discord.js";
import { nudgeDM, nudgeP0Card, nudgeP1Card } from "../render.js";
import { deliveryPlan } from "../routing.js";
import { minutesSince, staffedMinutesBetween } from "../util/time.js";

export async function nudgesJob(app: App): Promise<void> {
  const now = new Date();
  for (const t of app.db.listOpen()) {
    if (t.status !== "routed" || !t.routed_at || !t.owner_key) continue;
    try {
      if (t.priority === "P0" && t.priority_source !== "safety") {
        if (app.db.nudgeSent(t.id, "p0")) continue;
        if (minutesSince(t.routed_at, now) < app.cfg.escalation.p0_no_claim_minutes) continue;
        app.db.recordNudge(t.id, "p0");
        const plan = deliveryPlan(app.cfg, t.owner_key, "P0");
        for (const uid of plan.mentionUserIds) await dmUser(app.client, uid, nudgeDM(app.cfg, t));
        await replyOnCards(app, t.id, nudgeP0Card(app.cfg.roles.mox_staff, t.id), { roles: [app.cfg.roles.mox_staff] }, "channel");
      } else if (t.priority === "P1") {
        if (app.db.nudgeSent(t.id, "p1")) continue;
        const staffed = staffedMinutesBetween(new Date(t.routed_at), now, app.cfg.staffed_hours);
        if (staffed < app.cfg.escalation.p1_no_claim_staffed_hours * 60) continue;
        app.db.recordNudge(t.id, "p1");
        const plan = deliveryPlan(app.cfg, t.owner_key, "P1");
        if (plan.channelBased) {
          await replyOnCards(app, t.id, nudgeP1Card(plan.mentionUserIds, t.id), { users: plan.mentionUserIds }, "channel");
        } else {
          for (const uid of plan.mentionUserIds) await dmUser(app.client, uid, nudgeDM(app.cfg, t));
          await replyOnCards(app, t.id, nudgeP1Card(plan.mentionUserIds, t.id), { users: plan.mentionUserIds }, "thread");
        }
      }
    } catch (err) {
      app.log.error({ err, ticket: t.id }, "nudge failed");
    }
  }
}

async function replyOnCards(app: App, ticketId: number, content: string, allowed: { users?: string[]; roles?: string[] }, prefer: "channel" | "thread"): Promise<void> {
  const surfaces = app.db.surfaces(ticketId).filter((s) => s.kind !== "mirror");
  const target = surfaces.find((s) => s.kind === prefer) ?? surfaces[0];
  if (!target) return;
  const msg = await fetchMessage(app.client, target.channel_id, target.message_id);
  if (!msg) return;
  await msg.reply({ content, allowedMentions: { users: allowed.users ?? [], roles: allowed.roles ?? [] } });
}
