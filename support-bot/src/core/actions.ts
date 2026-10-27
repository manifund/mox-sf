/**
 * Every post-routing state change staff or reporters can cause (§6.4, §5.3, §5.4, §6.9).
 * Each one: mutate SQLite through lifecycle.ts, tell the reporter, refresh every surface, mirror to Airtable.
 */
import type { App } from "../app.js";
import type { Ticket } from "../db.js";
import { deliver, postThreadCard, retireChannelCards } from "../cards.js";
import { openTicketThread } from "./createTicket.js";
import { REMOVED_PREFIX } from "../airtable.js";
import { refreshSurfaces } from "../cards.js";
import { ownerDisplay, type OwnerKey, type Priority } from "../config.js";
import { dmUser, fetchMessage } from "../discord.js";
import {
  chatIntakeIdeaReply,
  digestItemLine,
  ideaAck,
  movedToIdeasMarker,
  closedAddNote,
  mentionUsers,
  notATicketByStaff,
  questionKeptAsIssue,
  questionRedirected,
  reporterClaimed,
  reporterDone,
  reporterMerged,
  reporterPriorityChanged,
  reporterReassigned,
  reporterReopened,
  reporterRouted,
  reporterUnclaimed,
  reporterWontDo,
  watcherClosed,
} from "../render.js";
import { deliveryPlan, route } from "../routing.js";
import { keywordTriage } from "../triage/keywords.js";
import { summaryFromWords, titleFromWords } from "../triage/wording.js";
import { ticketRef } from "../util/ids.js";
import { nowIso } from "../util/time.js";
import { archiveThread, disableOpenerButtons, maybeRoute, postInThread, sync } from "./flow.js";
import { transition } from "./lifecycle.js";

export interface Actor {
  id: string;
  name: string;
}

// ─── reactions ──────────────────────────────────────────────────────────────

export async function claim(app: App, t: Ticket, by: Actor): Promise<void> {
  if (t.status !== "routed") return;
  const next = transition(app.db, t, "claimed", { claimed_by: by.name }, by.id);
  await postInThread(app, next, reporterClaimed(by.name));
  await sync(app, next.id);
}

export async function unclaim(app: App, t: Ticket, by: Actor): Promise<void> {
  if (t.status !== "claimed") return;
  const next = transition(app.db, t, "routed", { claimed_by: null, claimed_at: null }, by.id);
  await postInThread(app, next, reporterUnclaimed(by.name));
  await sync(app, next.id);
}

export async function close(app: App, t: Ticket, by: Actor): Promise<void> {
  if (t.status !== "routed" && t.status !== "claimed") return;
  const until = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const next = transition(app.db, t, "done", { closed_by: by.name, closed_note_until: until }, by.id);
  await postInThread(app, next, reporterDone(by.name, null));
  await postInThread(app, next, closedAddNote());
  for (const w of app.db.watchers(next.id)) {
    if (w.thread_id) {
      const other = app.db.getTicketByThread(w.thread_id);
      if (other) await postInThread(app, other, watcherClosed(ticketRef(next.id), null));
    } else {
      await dmUser(app.client, w.user_id, watcherClosed(ticketRef(next.id), null));
    }
  }
  await sync(app, next.id);
}

/** ✅ removed within 10 minutes → back to where it was (§6.4). Not a reopen. */
export async function undoClose(app: App, t: Ticket, by: Actor): Promise<void> {
  if (t.status !== "done" || !t.closed_at) return;
  if (Date.now() - new Date(t.closed_at).getTime() > 10 * 60 * 1000) return;
  let next = transition(app.db, t, "routed", { reopen_count: t.reopen_count, closed_note_until: null }, by.id);
  if (t.claimed_by) next = transition(app.db, next, "claimed", { claimed_by: t.claimed_by, claimed_at: t.claimed_at ?? nowIso() }, by.id);
  await postInThread(app, next, `↩️ ${by.name} reopened this — it's ${next.status === "claimed" ? "being worked on" : "open"} again.`);
  await sync(app, next.id);
}

export async function saveResolutionNote(app: App, t: Ticket, note: string): Promise<void> {
  const next = app.db.updateTicket(t.id, { resolution_note: note.slice(0, 500), closed_note_until: null });
  await sync(app, next.id);
}

// ─── buttons ────────────────────────────────────────────────────────────────

export async function wontDo(app: App, t: Ticket, reason: string, by: Actor): Promise<void> {
  if (!["routed", "claimed"].includes(t.status)) return;
  const next = transition(app.db, t, "won't_do", { wont_do_reason: reason, closed_by: by.name }, by.id);
  await postInThread(app, next, reporterWontDo(by.name, reason));
  await sync(app, next.id);
}

export async function reassign(app: App, t: Ticket, toKey: OwnerKey, by: Actor): Promise<void> {
  if (!["routed", "claimed"].includes(t.status) || toKey === t.owner_key) return;
  let next = t;
  if (next.status === "claimed") next = transition(app.db, next, "routed", { claimed_by: null, claimed_at: null }, by.id);
  app.db.recordEvent(t.id, "reassign", by.id, t.owner_key, toKey);
  next = app.db.updateTicket(next.id, { owner_key: toKey, routed_by: null, owner_reasoning: null });
  await retireChannelCards(app, next, toKey);
  await deliver(app, next);
  const plan = deliveryPlan(app.cfg, toKey, next.priority ?? "P1");
  if (plan.mentionUserIds.length && !plan.channelBased) {
    await postInThread(app, next, `↪️ ${mentionUsers(plan.mentionUserIds)} — ${ticketRef(next.id)} is yours now (from ${by.name}).`, {
      allowedMentions: { users: plan.mentionUserIds },
    });
  }
  await postInThread(app, next, reporterReassigned(app.cfg, toKey));
  await sync(app, next.id);
}

/** §5.3 — staff override, re-run route(), edit, log before/after. Ideas can't be re-prioritised here. */
export async function setPriority(app: App, t: Ticket, p: Exclude<Priority, "P3">, by: Actor): Promise<void> {
  if (t.status === "new") return; // the opener buttons own this phase
  if (!["routed", "claimed"].includes(t.status) || !t.kind || !t.category) return;
  if (t.priority === p) return;
  app.db.recordEvent(t.id, "override", by.id, t.priority, p);
  let next = app.db.updateTicket(t.id, { priority: p, priority_source: "staff_override" });
  const r = route(app.cfg, {
    ticketId: next.id,
    kind: next.kind!,
    category: next.category!,
    priority: p,
    now: new Date(),
    suggestedOwner: next.suggested_owner,
    confidence: next.triage_confidence,
  });
  if (r.ownerKey !== next.owner_key) {
    if (next.status === "claimed") next = transition(app.db, next, "routed", { claimed_by: null, claimed_at: null }, by.id);
    await retireChannelCards(app, next, r.ownerKey);
    next = app.db.updateTicket(next.id, { owner_key: r.ownerKey, routed_by: r.routedBy });
    await postInThread(app, next, reporterReassigned(app.cfg, r.ownerKey));
  }
  await deliver(app, next); // a P0 breakout card, if the new priority calls for one
  await postInThread(app, next, reporterPriorityChanged(t.priority, p, by.name));
  await sync(app, next.id);
}

export async function markNotATicket(app: App, t: Ticket, by: Actor | null): Promise<void> {
  if (t.status === "logged") {
    // a chat-intake idea the author says wasn't one: pull it off the ideas list
    const next = transition(app.db, t, "not_a_ticket", {}, by?.id ?? null);
    app.mirror.enqueueUpsert(next); // Status column goes blank; the Resolution explains
    app.db.updateTicket(next.id, { resolution_note: "Undone by the member: not a building idea" });
    if (next.thread_id) await archiveThread(app, next, true);
    app.queue.schedule();
    return;
  }
  if (t.status === "new") {
    const next = transition(app.db, t, "not_a_ticket", { kind: "question" }, by?.id ?? null);
    await disableOpenerButtons(app, next);
    await postInThread(app, next, by ? notATicketByStaff(by.name) : questionRedirected());
    await archiveThread(app, next, true);
    app.queue.schedule();
    return;
  }
  if (!["routed", "claimed"].includes(t.status)) return;
  // already routed: close it out honestly as won't do with the redirect as the reason
  const next = transition(app.db, t, "won't_do", { wont_do_reason: "Not a building issue — see #ask-staff", closed_by: by?.name ?? "staff" }, by?.id ?? null);
  await postInThread(app, next, notATicketByStaff(by?.name ?? "Staff"));
  await sync(app, next.id);
  await archiveThread(app, next, true);
}

/** Reporter answered "Yes, something's broken" on the redirect (§6.6). */
export async function keepAsIssue(app: App, t: Ticket): Promise<void> {
  if (t.status !== "new" || t.kind !== "question") return;
  const kw = keywordTriage(t.description, t.context);
  const next = app.db.updateTicket(t.id, {
    kind: "issue",
    category: t.category && t.category !== "other" ? t.category : kw.category,
    question_resolved: 1,
    redirect_miss: 1,
  });
  app.db.recordEvent(next.id, "redirect_miss", null, "question", "issue");
  await postInThread(app, next, questionKeptAsIssue());
  await maybeRoute(app, next.id);
}

// ─── duplicates (§8) ────────────────────────────────────────────────────────

export async function acceptDuplicate(app: App, t: Ticket): Promise<void> {
  if (t.status !== "new" || t.dupe_offer_of === null) return;
  const other = app.db.getTicket(t.dupe_offer_of);
  const next = transition(app.db, t, "duplicate", { duplicate_of: t.dupe_offer_of, dupe_offer_of: null, kind: t.kind ?? "issue" });
  if (other && t.reporter_id) app.db.addWatcher(other.id, t.reporter_id, t.thread_id);
  app.db.recordEvent(next.id, "duplicate", null, null, t.dupe_offer_of);
  await disableOpenerButtons(app, next);
  await postInThread(app, next, reporterMerged(t.dupe_offer_of));
  await archiveThread(app, next, true);
  app.queue.schedule();
}

export async function declineDuplicate(app: App, t: Ticket): Promise<void> {
  if (t.status !== "new" || t.dupe_offer_of === null) return;
  app.db.updateTicket(t.id, { dupe_offer_of: null });
  await maybeRoute(app, t.id);
}

// ─── idea -> work item (staff decision) ─────────────────────────────────────

/**
 * Staff decided an idea is real work: give it a priority and an owner, open its private thread, post the
 * card and tell the reporter. `ownerKey` overrides routing, then the idea's own owner; otherwise route() picks as for any issue.
 */
export async function promoteIdea(app: App, t: Ticket, opts: { priority: Exclude<Priority, "P3">; ownerKey?: OwnerKey }, by: Actor): Promise<Ticket> {
  if (t.status !== "logged") return t;
  const category = t.category ?? "other";
  const r = route(app.cfg, {
    ticketId: t.id,
    kind: "issue",
    category,
    priority: opts.priority,
    now: new Date(),
    suggestedOwner: t.suggested_owner,
    confidence: t.triage_confidence,
  });
  const ideaOwner = t.owner_key && t.owner_key !== "unassigned" ? t.owner_key : undefined; // someone already looking after it keeps it
  const chosen = opts.ownerKey ?? ideaOwner;
  const owner = chosen ?? r.ownerKey;
  app.db.recordEvent(t.id, "promote", by.id, "idea", { priority: opts.priority, owner });
  let next = app.db.updateTicket(t.id, { kind: "issue", category, priority: opts.priority, priority_source: "staff_override" });
  next = await openTicketThread(app, next, { pingReporter: true });
  next = transition(app.db, next, "routed", { owner_key: owner, routed_by: chosen ? null : r.routedBy }, by.id);
  next = await postThreadCard(app, next);
  await deliver(app, next);
  const plan = deliveryPlan(app.cfg, owner, opts.priority);
  await postInThread(app, next, `${by.name} turned this from an idea into a work item.`);
  await postInThread(app, next, reporterRouted(app.cfg, next, { channelBased: plan.channelBased }));
  app.mirror.enqueueUpsert(next);
  app.queue.schedule();
  return app.db.getTicket(next.id)!;
}

/**
 * Staff decided open work is really an idea / nice-to-have. Every card collapses to a marker (so the owner
 * isn't left holding it), the ticket goes on the ideas list at P3 unassigned, the reporter gets the ideas
 * line, any chat confirmation is corrected, and the private thread is archived and locked (not deleted).
 */
export async function moveToIdeas(app: App, t: Ticket, by: Actor): Promise<Ticket> {
  if (t.status !== "routed" && t.status !== "claimed") return t;
  app.db.recordEvent(t.id, "to_idea", by.id, { priority: t.priority, owner: t.owner_key }, "idea");
  const next = transition(app.db, t, "logged", {}, by.id);
  for (const s of app.db.surfaces(next.id)) {
    const msg = await fetchMessage(app.client, s.channel_id, s.message_id).catch(() => null);
    if (msg) {
      const content = s.kind === "digest" ? digestItemLine(app.cfg, next) : movedToIdeasMarker(app.cfg, next, by.name);
      await msg.edit({ content, embeds: [], components: [], attachments: [], allowedMentions: { parse: [] } }).catch(() => undefined);
    }
    if (s.kind !== "digest") app.db.removeSurface(s.message_id);
  }
  await postInThread(app, next, ideaAck(next.id));
  const confirm = app.db.kvGet(`chat_reply:${next.id}`)?.split(":");
  if (confirm?.[0] && confirm[1] && confirm[0] !== next.thread_id) {
    const msg = await fetchMessage(app.client, confirm[0], confirm[1]).catch(() => null);
    if (msg) {
      const prefix = next.reporter_id && msg.content.startsWith(`<@${next.reporter_id}>`) ? `<@${next.reporter_id}> ` : "";
      await msg.edit({ content: `${prefix}${chatIntakeIdeaReply(next)}`, allowedMentions: { parse: [] } }).catch(() => undefined);
    }
  }
  await archiveThread(app, next, true);
  app.mirror.enqueueUpsert(next);
  app.queue.schedule();
  return next;
}

/**
 * Someone deleted the ticket's Airtable row: "this shouldn't be a ticket". Close it everywhere, quietly:
 * no message to the reporter, cards collapse, the thread is archived, and the row is never recreated.
 */
export async function removeFromAirtable(app: App, t: Ticket): Promise<void> {
  const reason = "Removed in Airtable";
  let next = t;
  if (t.status === "routed" || t.status === "claimed") next = transition(app.db, t, "won't_do", { wont_do_reason: reason, closed_by: "Airtable" }, "airtable");
  else if (t.status === "logged" || t.status === "new") next = transition(app.db, t, "not_a_ticket", { wont_do_reason: reason, closed_by: "Airtable", closed_at: nowIso() }, "airtable");
  app.db.dropMirrorQueue(next.id);
  next = app.db.updateTicket(next.id, { mirror_record_id: `${REMOVED_PREFIX}${t.mirror_record_id}` });
  app.db.recordEvent(next.id, "airtable_removed", "airtable", t.status, next.status);
  await refreshSurfaces(app, next.id); // collapsed lines; reporter is not messaged
  if (next.thread_id) await archiveThread(app, next, true);
  app.queue.schedule();
}

/** An idea that was just done (no work ticket needed). */
export async function closeIdea(app: App, t: Ticket, by: Actor): Promise<void> {
  if (t.status !== "logged") return;
  const next = transition(app.db, t, "done", { closed_by: by.name }, by.id);
  app.mirror.enqueueUpsert(next);
  app.queue.schedule();
}

/** Staff decided not to pursue an idea. The reason is recorded on the board. */
export async function declineIdea(app: App, t: Ticket, reason: string, by: Actor): Promise<void> {
  if (t.status !== "logged") return;
  const next = transition(app.db, t, "not_a_ticket", { wont_do_reason: reason, closed_by: by.name, closed_at: nowIso() }, by.id);
  app.mirror.enqueueUpsert(next);
  app.queue.schedule();
}

/** Who's looking after an idea. It stays an idea: no thread post, no ping. */
export async function setIdeaOwner(app: App, t: Ticket, toKey: OwnerKey, by: Actor): Promise<void> {
  if (t.status !== "logged" || toKey === (t.owner_key ?? "unassigned")) return;
  app.db.recordEvent(t.id, "idea_owner", by.id, t.owner_key, toKey);
  const next = app.db.updateTicket(t.id, { owner_key: toKey });
  app.mirror.enqueueUpsert(next);
  app.queue.schedule();
}

// ─── reopen (§5.4) ──────────────────────────────────────────────────────────

export async function reopen(app: App, t: Ticket, excerpt: string): Promise<void> {
  if (t.status !== "done") return;
  const previousClaimant = t.claimed_by;
  const next = transition(app.db, t, "routed", { resolution_note: t.resolution_note, closed_note_until: null }, t.reporter_id);
  app.db.recordEvent(next.id, "reopen", t.reporter_id, null, excerpt.slice(0, 120));
  const plan = deliveryPlan(app.cfg, next.owner_key ?? "unassigned", next.priority ?? "P1");
  const mentionIds = plan.mentionUserIds;
  await postInThread(
    app,
    next,
    `${reporterReopened(previousClaimant)}${mentionIds.length ? ` ${mentionUsers(mentionIds)}` : ""} — "${excerpt.slice(0, 120)}"`,
    { allowedMentions: { users: mentionIds } },
  );
  await sync(app, next.id);
}

// ─── /log (§6.8) ────────────────────────────────────────────────────────────

export interface StaffLogInput {
  what: string;
  where: string | null;
  askedBy: { id: string; name: string } | null;
  minutes: number | null;
  invoker: Actor;
  ownerKey: OwnerKey;
}

export function staffLog(app: App, input: StaffLogInput): Ticket {
  const kw = keywordTriage(input.what);
  let t = app.db.insertTicket({
    reporter_id: input.askedBy?.id ?? input.invoker.id,
    reporter_name: input.askedBy?.name ?? input.invoker.name,
    source: "staff_log",
    contact_kind: "discord",
    contact_value: input.askedBy?.id ?? input.invoker.id,
    description: input.what,
    location: input.where ?? "—",
    context: null,
    visibility: "private",
    visibility_source: null,
    status: "new",
  });
  t = app.db.updateTicket(t.id, {
    kind: "issue",
    category: kw.category,
    title: titleFromWords(input.what),
    staff_summary: summaryFromWords(input.what),
    triage_method: "keywords",
    triaged_at: nowIso(),
    priority: "P2",
    priority_source: "staff_log",
    minutes_spent: input.minutes,
  });
  t = transition(app.db, t, "routed", { owner_key: input.ownerKey, routed_by: "category_map" }, input.invoker.id);
  t = transition(app.db, t, "done", { closed_by: input.invoker.name, claimed_by: input.invoker.name, claimed_at: nowIso() }, input.invoker.id);
  app.mirror.enqueueUpsert(t);
  return t;
}

export { ownerDisplay };
