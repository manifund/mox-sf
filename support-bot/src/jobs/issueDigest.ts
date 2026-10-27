/**
 * On-demand issue digest (`/mox digest`, or kv `digest_request`): everything open, plus what was created or
 * closed today, split into work vs ideas. Each open work item is its own message, registered as a ticket
 * surface, so a staff member reacting 👀 / ✅ there claims or closes the ticket and the line updates live.
 */
import type { App } from "../app.js";
import { CLOSED_STATUSES, type Ticket } from "../db.js";
import { fetchSendable } from "../discord.js";
import { digestHeader, digestItemLine, digestLists } from "../render.js";
import { ensureDigestSummaries } from "../digestSummary.js";
import { syncFromAirtable } from "../airtableSync.js";
import { startOfLocalDayIso } from "../util/time.js";

export const DIGEST_REQUEST_KEY = "digest_request";

function dayLabel(tz: string): string {
  return new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });
}

export async function postIssueDigest(app: App): Promise<{ messages: number; open: number; closed: number; ideas: number }> {
  await syncFromAirtable(app); // pick up anything changed in Airtable first, so the digest is current
  const tz = app.cfg.claudio_hours.tz;
  const since = startOfLocalDayIso(tz);
  const byId = new Map<number, Ticket>();
  for (const t of [...app.db.listCreatedSince(since), ...app.db.listClosedSince(since)]) byId.set(t.id, t);
  const today = [...byId.values()];
  const open = app.db.listOpen().filter((t) => t.kind !== "idea").sort((a, b) => (a.priority ?? "P1").localeCompare(b.priority ?? "P1") || a.id - b.id);
  const closed = today.filter((t) => CLOSED_STATUSES.includes(t.status) && t.kind !== "idea" && t.kind !== "question").sort((a, b) => a.id - b.id);
  const ideas = today.filter((t) => t.kind === "idea" && t.status === "logged").sort((a, b) => a.id - b.id);

  await ensureDigestSummaries(app, [...open, ...closed, ...ideas]); // short titles for skimming; tickets keep the reporter's words
  const ch = await fetchSendable(app.client, app.cfg.digest.channel_id);
  if (!ch) throw new Error("digest channel not reachable");
  let messages = 0;
  await ch.send({ content: digestHeader(dayLabel(tz), { open: open.length, closed: closed.length, ideas: ideas.length }), allowedMentions: { parse: [] } });
  messages++;
  for (const t of open) {
    const msg = await ch.send({ content: digestItemLine(app.cfg, t), allowedMentions: { parse: [] } });
    messages++;
    // no pre-added reactions (confusing); staff add 👀 / ✅ themselves and it still works
    app.db.addSurface({ ticket_id: t.id, kind: "digest", channel_id: msg.channelId, message_id: msg.id });
  }
  for (const chunk of digestLists(app.cfg, closed, ideas)) {
    await ch.send({ content: chunk, allowedMentions: { parse: [] } });
    messages++;
  }
  app.log.info({ open: open.length, closed: closed.length, ideas: ideas.length, messages }, "issue digest posted");
  return { messages, open: open.length, closed: closed.length, ideas: ideas.length };
}

/** Lets a shell script or another process ask the running bot for a digest. */
export async function drainDigestRequest(app: App): Promise<void> {
  if (!app.db.kvGet(DIGEST_REQUEST_KEY)) return;
  app.db.kvDel(DIGEST_REQUEST_KEY);
  await postIssueDigest(app);
}
