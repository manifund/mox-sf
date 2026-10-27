/**
 * "@support-bot explain MOX-119" — answer questions about a ticket, grounded only in its record and
 * thread. Private tickets stay private: answers go to staff or the ticket's own reporter, and details
 * are only shared in the ticket's thread or a channel members can't see.
 */
import { PermissionFlagsBits, type Message, type GuildChannel } from "discord.js";
import type { App } from "./app.js";
import { ownerDisplay } from "./config.js";
import type { Ticket } from "./db.js";
import { fetchThread, isStaffUser } from "./discord.js";
import { CATEGORY_LABEL, PRIORITY_WORD, STATUS_LABEL, threadUrl } from "./render.js";
import { ticketRef } from "./util/ids.js";

let qaPrompt = "";
export function setQaPrompt(p: string): void {
  qaPrompt = p;
}

/** Is this a place members can read? (Details of a private ticket must not be posted there.) */
function membersCanSee(message: Message): boolean {
  const ch = message.channel;
  const base = (ch.isThread() ? ch.parent : ch) as GuildChannel | null;
  if (!base || !("guild" in base)) return false;
  const everyone = base.guild.roles.everyone;
  return base.permissionsFor(everyone)?.has(PermissionFlagsBits.ViewChannel) ?? false;
}

function local(iso: string | null, tz: string): string {
  return iso ? new Date(iso).toLocaleString("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }) : "n/a";
}

async function recordFor(app: App, t: Ticket): Promise<string> {
  const tz = app.cfg.claudio_hours.tz;
  const lines = [
    `Ticket ${ticketRef(t.id)}`,
    `Kind: ${t.kind ?? "unknown"} · Status: ${STATUS_LABEL[t.status]} (${t.status})`,
    `Reporter: ${t.reporter_name} · Reported: ${local(t.created_at, tz)} · Source: ${t.source}`,
    `What the reporter wrote (verbatim): """${t.description}"""`,
    `Location they gave: ${t.location}`,
    ...(t.context ? [`Their extra notes: """${t.context}"""`] : []),
    `Category: ${t.category ? CATEGORY_LABEL[t.category] : "n/a"} · Priority: ${t.priority ? PRIORITY_WORD[t.priority] : "n/a"} (${t.priority_source ?? "n/a"})`,
    `Reporter ticked urgent: ${t.reported_priority === "P0" ? "yes" : "no"} · Model's urgency read: ${t.assessed_priority ?? "n/a"}`,
    `Owner: ${ownerDisplay(app.cfg, t.owner_key)}${t.routed_by === "ai_judgment" && t.owner_reasoning ? ` (chosen because: ${t.owner_reasoning})` : ""}`,
    `Claimed by: ${t.claimed_by ?? "nobody"}${t.claimed_at ? ` at ${local(t.claimed_at, tz)}` : ""}`,
    `Closed: ${t.closed_at ? `${local(t.closed_at, tz)} by ${t.closed_by ?? "?"}` : "not closed"}`,
    ...(t.resolution_note ? [`Resolution note: ${t.resolution_note}`] : []),
    ...(t.wont_do_reason ? [`Won't-do reason: ${t.wont_do_reason}`] : []),
    ...(t.duplicate_of ? [`Merged into ${ticketRef(t.duplicate_of)}`] : []),
    `Reopened ${t.reopen_count} time(s) · Photos: ${app.db.photos(t.id).length}`,
  ];
  if (t.thread_id) {
    const th = await fetchThread(app.client, t.thread_id);
    if (th) {
      const msgs = [...(await th.messages.fetch({ limit: app.cfg.ticket_qa.thread_messages }).catch(() => new Map())).values()]
        .filter((m) => !m.system && m.content.trim())
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      if (msgs.length) {
        lines.push("", "Thread conversation (oldest first):");
        for (const m of msgs) lines.push(`- ${m.author.bot ? "bot" : (m.member?.displayName ?? m.author.username)}: ${m.content.replace(/\s+/g, " ").slice(0, 400)}`);
      }
    }
  }
  return lines.join("\n");
}

/** A deterministic answer for when the model is unavailable. */
function fallback(app: App, t: Ticket): string {
  return [
    `**${ticketRef(t.id)}** is ${STATUS_LABEL[t.status]}, owned by ${ownerDisplay(app.cfg, t.owner_key)}${t.claimed_by ? `, claimed by ${t.claimed_by}` : ""}.`,
    `${t.reporter_name} wrote: "${t.description.slice(0, 500)}"`,
    t.location && t.location !== "Not stated" ? `Location: ${t.location}.` : "No location was given.",
  ].join("\n");
}

/** Answer `question` about ticket `t`, in a thread (`reply` posts it). Returns false if not allowed here. */
export async function answerAboutTicket(app: App, message: Message, t: Ticket, question: string, reply: (text: string) => Promise<void>): Promise<void> {
  const askerIsStaff = await isStaffUser(app.client, app.cfg, message.author.id);
  const isReporter = message.author.id === t.reporter_id;
  if (!askerIsStaff && !isReporter) {
    await reply(`Only Mox staff and the person who reported **${ticketRef(t.id)}** can ask about it.`);
    return;
  }
  const inOwnThread = message.channel.isThread() && message.channel.id === t.thread_id;
  if (!inOwnThread && membersCanSee(message)) {
    const where = t.thread_id ? ` Ask in its thread: ${threadUrl(app.cfg, t.thread_id)}` : " Ask in a staff channel.";
    await reply(`**${ticketRef(t.id)}** is private, so I won't go into it here.${where}`);
    return;
  }
  const q = question.replace(/MOX-?\d+/gi, "").trim() || "Explain this ticket: what was reported, where, and where it stands.";
  let answer: string | null = null;
  if (app.ai) answer = await app.ai.complete(qaPrompt, `${await recordFor(app, t)}\n\nQuestion from ${askerIsStaff ? "a staff member" : "the reporter"}: ${q}`, 700);
  answer = (answer ?? fallback(app, t)).replace(/—/g, ",").trim();
  if (answer.length > 1900) answer = `${answer.slice(0, 1897)}...`;
  await reply(answer);
  app.log.info({ ticket: t.id, asker: message.author.id, staff: askerIsStaff }, "answered a question about a ticket");
}
