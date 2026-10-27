/**
 * The intake state machine between "row exists" and "routed" (§5.2):
 * triage result, priority pick / timeout, duplicate offer, question redirect,
 * safety fast-path, escalate-only merge, route.
 */
import type { App } from "../app.js";
import type { Ticket } from "../db.js";
import { deliver, postThreadCard, refreshSurfaces } from "../cards.js";
import { fetchMessage, fetchSendable, fetchThread } from "../discord.js";
import {
  chatIntakeIdeaReply,
  chatIntakeMissingLocation,
  duplicateOffer,
  ideaAck,
  opsKeywordFallback,
  questionRedirect,
  reporterRouted,
  safetyFastPathNote,
  threadOpening,
} from "../render.js";
import { deliveryPlan, route } from "../routing.js";
import type { TriageDecision } from "../triage/index.js";
import { mergePriority } from "../triage/merge.js";
import { summaryFromWords, titleFromWords } from "../triage/wording.js";
import { ticketRef } from "../util/ids.js";
import { nowIso } from "../util/time.js";
import { ownerDisplay } from "../config.js";
import { transition } from "./lifecycle.js";
import { openerKey } from "./createTicket.js";

const DUPLICATE_THRESHOLD = 0.7;
const TRIAGE_WAIT_MS = 10_000;

/** in-flight triage promises so a fast reporter can wait ≤10s for the model (§5.2) */
const pending = new Map<number, Promise<void>>();

export function kickOffTriage(app: App, ticketId: number, presetKind?: "idea"): void {
  const p = (async () => {
    const t = app.db.getTicket(ticketId);
    if (!t || t.triaged_at) return;
    const decision = await app.triage.run(t);
    if (presetKind) decision.kind = presetKind; // the chat gate answered the narrower question; trust it
    if (app.triage.consecutiveFallbacks >= 5) void app.ops.send("keyword_fallback", opsKeywordFallback());
    await applyTriage(app, ticketId, decision);
  })()
    .catch((err) => app.log.error({ err, ticket: ticketId }, "triage kickoff failed"))
    .finally(() => pending.delete(ticketId));
  pending.set(ticketId, p);
}

export async function postInThread(app: App, t: Ticket, content: string, extra: Record<string, unknown> = {}): Promise<void> {
  if (!t.thread_id) return;
  const thread = await fetchSendable(app.client, t.thread_id);
  if (!thread) return;
  try {
    await thread.send({ content, allowedMentions: { users: t.reporter_id ? [t.reporter_id] : [], roles: [] }, ...extra });
  } catch (err) {
    app.log.warn({ err, ticket: t.id }, "thread post failed");
  }
}

async function renameThread(app: App, t: Ticket): Promise<void> {
  if (!t.thread_id || !t.title) return;
  const thread = await fetchThread(app.client, t.thread_id);
  if (!thread) return;
  try {
    await thread.setName(`${ticketRef(t.id)} · ${t.title}`.slice(0, 100));
  } catch (err) {
    app.log.warn({ err, ticket: t.id }, "thread rename failed");
  }
}

/** Re-render the opener for the ticket's current kind (the first version is posted before triage). */
export async function rewriteOpener(app: App, t: Ticket): Promise<void> {
  const openerId = app.db.kvGet(openerKey(t.id));
  if (!openerId || !t.thread_id) return;
  const msg = await fetchMessage(app.client, t.thread_id, openerId).catch(() => null);
  if (msg) await msg.edit({ ...threadOpening(t), allowedMentions: { parse: [] } }).catch((err) => app.log.warn({ err, ticket: t.id }, "opener rewrite failed"));
}

/** Strip the opener's buttons once a ticket is closed out before routing (idea, duplicate, not a ticket). */
export async function disableOpenerButtons(app: App, t: Ticket): Promise<void> {
  const openerId = app.db.kvGet(openerKey(t.id));
  if (!openerId || !t.thread_id) return;
  try {
    const msg = await fetchMessage(app.client, t.thread_id, openerId);
    if (msg) await msg.edit({ components: [], allowedMentions: { parse: [] } });
  } catch (err) {
    app.log.warn({ err, ticket: t.id }, "opener edit failed");
  }
}

export async function archiveThread(app: App, t: Ticket, lock = false): Promise<void> {
  if (!t.thread_id) return;
  const thread = await fetchThread(app.client, t.thread_id);
  if (!thread) return;
  try {
    if (lock) await thread.setLocked(true);
    await thread.setArchived(true);
  } catch (err) {
    app.log.warn({ err, ticket: t.id }, "archive failed");
  }
}

/** Store the decision and take the next step for this kind of thing. */
export async function applyTriage(app: App, ticketId: number, d: TriageDecision): Promise<void> {
  let t = app.db.getTicket(ticketId);
  if (!t || t.triaged_at || t.status !== "new") return;
  t = app.db.updateTicket(t.id, {
    kind: d.kind,
    // the reporter's own words; the model's paraphrase is never shown (it lost context)
    title: titleFromWords(t.description),
    staff_summary: summaryFromWords(t.description),
    category: d.category,
    assessed_priority: d.assessed_priority,
    suggested_owner: d.suggested_owner,
    owner_reasoning: d.owner_reasoning,
    triage_method: d.method,
    triage_confidence: d.confidence,
    triage_reasoning: d.reasoning,
    triaged_at: nowIso(),
  });
  app.log.info({ ticket: t.id, method: d.method, kind: d.kind, category: d.category, assessed: d.assessed_priority, conf: d.confidence }, "triaged");
  await renameThread(app, t);

  if (d.kind === "question") {
    t = app.db.updateTicket(t.id, { question_asked_at: nowIso() });
    await postInThread(app, t, questionRedirect(t).content, { components: questionRedirect(t).components });
    return;
  }

  if (d.kind === "idea") {
    await logIdea(app, t);
    return;
  }

  // a chat capture with no location: ask now that we know it's an issue (ideas don't need one)
  if (t.source === "chat" && t.location === "Not stated" && t.thread_id) {
    await postInThread(app, t, chatIntakeMissingLocation(), { allowedMentions: { parse: [] } });
  }

  if (d.category === "safety") {
    // C9 — safety never waits on the reporter
    t = app.db.updateTicket(t.id, { priority: "P0", priority_source: "safety" });
    await routeTicket(app, t.id);
    const fresh = app.db.getTicket(t.id)!;
    await postInThread(app, fresh, safetyFastPathNote(ownerDisplay(app.cfg, fresh.owner_key)));
    return;
  }

  if (d.duplicate_of !== null && d.duplicate_confidence >= DUPLICATE_THRESHOLD) {
    const other = app.db.getTicket(d.duplicate_of);
    if (other && (other.status === "routed" || other.status === "claimed")) {
      t = app.db.updateTicket(t.id, { dupe_offer_of: other.id, dupe_offered_at: nowIso() });
      const offer = duplicateOffer(t, other);
      await postInThread(app, t, offer.content, { components: offer.components });
      return; // pause; priority picks are held until answered or 3 min pass
    }
  }

  await maybeRoute(app, t.id);
}

export async function logIdea(app: App, t: Ticket): Promise<void> {
  const logged = transition(app.db, t, "logged", { kind: "idea" });
  app.mirror.enqueueUpsert(logged);
  await disableOpenerButtons(app, logged);
  await rewriteOpener(app, logged); // the issue instructions in the opener don't apply to an idea
  // A chat capture already posted a confirmation in a thread on the member's message.
  const confirm = app.db.kvGet(`chat_reply:${logged.id}`); // "<threadId>:<messageId>"
  const [confirmThread, confirmMsg] = confirm?.split(":") ?? [];
  const confirmedInOwnThread = !!confirmThread && confirmThread === logged.thread_id;
  // Its own thread still needs closing words unless the confirmation already lives there.
  if (!confirmedInOwnThread) await postInThread(app, logged, ideaAck(logged.id));
  // If that confirmation promised an issue ("updates in your thread"), correct it to the idea copy.
  if (logged.source === "chat" && confirmThread && confirmMsg && !confirmedInOwnThread) {
    const msg = await fetchMessage(app.client, confirmThread, confirmMsg).catch(() => null);
    if (msg) {
      const prefix = logged.reporter_id && msg.content.startsWith(`<@${logged.reporter_id}>`) ? `<@${logged.reporter_id}> ` : "";
      await msg.edit({ content: `${prefix}${chatIntakeIdeaReply(logged)}`, allowedMentions: { parse: [] } }).catch(() => undefined);
    }
  }
  app.queue.schedule();
}

/** Wait up to 10s for the model; otherwise decide on keywords. Never hold a ticket for the AI. */
export async function ensureTriaged(app: App, ticketId: number): Promise<void> {
  const t = app.db.getTicket(ticketId);
  if (!t || t.triaged_at) return;
  const inflight = pending.get(ticketId);
  if (inflight) {
    await Promise.race([inflight, new Promise((r) => setTimeout(r, TRIAGE_WAIT_MS))]);
  }
  const again = app.db.getTicket(ticketId);
  if (again && !again.triaged_at) {
    app.log.warn({ ticket: ticketId }, "triage too slow — routing on keywords");
    await applyTriage(app, ticketId, app.triage.keywords(again));
  }
}

/** Merge and route as soon as triage is in and nothing is holding the ticket. Urgency came in on the modal. */
export async function maybeRoute(app: App, ticketId: number): Promise<void> {
  const t = app.db.getTicket(ticketId);
  if (!t || t.status !== "new" || !t.triaged_at) return;
  if (t.kind === "question" && !t.question_resolved) return;
  if (t.kind === "idea") return;
  if (t.dupe_offer_of !== null) return; // waiting on the duplicate answer

  const merged = mergePriority({
    kind: t.kind,
    category: t.category,
    reported: t.reported_priority,
    reportedSource: "reporter",
    assessed: t.assessed_priority,
  });
  app.db.updateTicket(t.id, { priority: merged.priority, priority_source: merged.source });
  if (merged.disagreement) app.db.recordEvent(t.id, "disagreement", null, t.reported_priority, t.assessed_priority);
  if (merged.source === "ai_escalation") app.db.recordEvent(t.id, "ai_escalation", null, t.reported_priority, merged.priority);
  await routeTicket(app, t.id);
}

/** route() -> routed -> card -> deliver -> tell the reporter -> Airtable. */
export async function routeTicket(app: App, ticketId: number): Promise<Ticket | null> {
  let t = app.db.getTicket(ticketId);
  if (!t || t.status !== "new" || !t.kind || !t.category || !t.priority) return null;
  const r = route(app.cfg, {
    ticketId: t.id,
    kind: t.kind,
    category: t.category,
    priority: t.priority,
    now: new Date(),
    suggestedOwner: t.suggested_owner,
    confidence: t.triage_confidence,
  });
  t = transition(app.db, t, "routed", { owner_key: r.ownerKey, routed_by: r.routedBy ?? undefined });
  app.log.info({ ticket: t.id, owner: r.ownerKey, rule: r.rule, priority: t.priority }, "routed");
  t = await postThreadCard(app, t);
  await deliver(app, t);
  const plan = deliveryPlan(app.cfg, r.ownerKey, t.priority ?? "P1");
  await postInThread(app, t, reporterRouted(app.cfg, t, { channelBased: plan.channelBased }));
  app.mirror.enqueueUpsert(t);
  app.queue.schedule();
  return t;
}

/** After a state change that is not routing: edit every surface + Airtable + queue. */
export async function sync(app: App, ticketId: number): Promise<void> {
  const t = app.db.getTicket(ticketId);
  if (!t) return;
  await refreshSurfaces(app, t.id);
  app.mirror.enqueueUpsert(t);
}
