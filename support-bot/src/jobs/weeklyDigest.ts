/** Monday 09:00 PT — what got done, what's open, the ideas count, the signals (§9.3). */
import type { App } from "../app.js";
import { fetchSendable, warnInaccessibleOnce } from "../discord.js";
import { DIGEST_RECAP_SYSTEM, weeklyDigest, type DigestData } from "../render.js";
import { ageShort, isoDaysAgo } from "../util/time.js";
import { ticketRef } from "../util/ids.js";
import { ensureDigestSummaries } from "../digestSummary.js";
import { syncFromAirtable } from "../airtableSync.js";

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function fmtMinutes(m: number): string {
  if (m < 60) return `${Math.round(m)}m`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

export async function buildDigest(app: App): Promise<string> {
  await syncFromAirtable(app); // Airtable edits first, so the digest reflects them
  const since = isoDaysAgo(7);
  const closed = app.db.listClosedSince(since);
  const created = app.db.listCreatedSince(since);
  const open = app.db.listOpen().sort((a, b) => (a.priority ?? "P1").localeCompare(b.priority ?? "P1") || a.id - b.id);
  const ideas = app.db.listLogged();
  await ensureDigestSummaries(app, open);

  const byOwner: Record<string, number> = {};
  let viaLog = 0;
  const closeMinutes: number[] = [];
  for (const t of closed) {
    if (t.status !== "done") continue;
    byOwner[t.owner_key ?? "unassigned"] = (byOwner[t.owner_key ?? "unassigned"] ?? 0) + 1;
    if (t.source === "staff_log") viaLog++;
    else if (t.closed_at) closeMinutes.push((new Date(t.closed_at).getTime() - new Date(t.routed_at ?? t.created_at).getTime()) / 60000);
  }

  let recap: string | null = null;
  const doneRows = closed.filter((t) => t.status === "done");
  if (app.cfg.digest.closed_summary === "ai" && app.ai && doneRows.length) {
    const rows = doneRows
      .map((t) => `${ticketRef(t.id)} · ${t.category ?? "other"} · ${t.location} · ${t.title ?? t.description.slice(0, 80)}${t.resolution_note ? ` · resolved: ${t.resolution_note}` : ""} · by ${t.closed_by ?? "?"}`)
      .join("\n");
    recap = await app.ai.complete(DIGEST_RECAP_SYSTEM(app.cfg.digest.closed_summary_max_bullets), rows);
  }

  const issuesThisWeek = created.filter((t) => t.kind === "issue" && t.priority && t.priority !== "P3");
  const oldestIdea = ideas.length ? ideas.reduce((a, b) => (a.created_at < b.created_at ? a : b)) : null;
  const weekStart = new Date(since);
  const weekLabel = weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: app.cfg.claudio_hours.tz });

  const data: DigestData = {
    weekLabel,
    closed,
    closedRecap: recap,
    byOwner,
    viaLog,
    medianClose: (() => {
      const m = median(closeMinutes);
      return m === null ? null : fmtMinutes(m);
    })(),
    open,
    ideasNew: created.filter((t) => t.kind === "idea").length,
    ideasTotal: ideas.length,
    ideasOldestAge: oldestIdea ? ageShort(oldestIdea.created_at) : null,
    signals: {
      p0Rate: issuesThisWeek.length ? issuesThisWeek.filter((t) => t.priority === "P0").length / issuesThisWeek.length : null,
      disagreements: app.db.countEventsSince("disagreement", since),
      overrides: app.db.countEventsSince("override", since),
      keywordFallbacks: created.filter((t) => t.triage_method === "keywords" && t.source === "discord").length,
      aiJudgment: created.filter((t) => t.routed_by === "ai_judgment").length,
      duplicates: app.db.countEventsSince("duplicate", since),
      chatIntake: created.filter((t) => t.source === "chat").length,
      chatUndone: created.filter((t) => t.source === "chat" && (t.status === "not_a_ticket" || (t.status === "won't_do" && t.wont_do_reason?.startsWith("Not a building issue")))).length,
    },
  };
  return weeklyDigest(app.cfg, data);
}

export async function weeklyDigestJob(app: App): Promise<void> {
  const text = await buildDigest(app);
  const ch = await fetchSendable(app.client, app.cfg.digest.channel_id);
  if (!ch) return void warnInaccessibleOnce(app.cfg.digest.channel_id, "weekly digest");
  await ch.send({ content: text, allowedMentions: { parse: [] } });
  app.log.info("weekly digest posted");
}
