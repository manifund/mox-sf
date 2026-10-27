/**
 * Watch chat channels (#ask-staff) and open a ticket when a message is clearly a building report.
 * No form: the message is the description, the author is the reporter, triage picks the rest.
 * The bot's reply carries an Undo button so a false positive costs one click.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  ThreadAutoArchiveDuration,
  type Message,
  type MessageActionRowComponentBuilder,
  type ThreadChannel,
} from "discord.js";
import type { App } from "../app.js";
import { intakeDecision, isCautious, tagMeansReferencedMessage, worthClassifying } from "../chatIntake.js";
import type { ChatGateOutput } from "../triage/ai.js";
import { setQaPrompt } from "../ticketQa.js";
import { ingestPhotos } from "./threadMessages.js";
import { joinReporterParts } from "../triage/wording.js";
import { handleTicketMention } from "../ticketCommands.js";
import { parseTicketRef } from "../util/ids.js";
import { createTicket } from "../core/createTicket.js";
import { fetchMessage, isStaffUser } from "../discord.js";
import { chatIntakeIdeaReply, chatIntakeNotAnIssue, chatIntakeReply, chatIntakeTagHelp } from "../render.js";
import { cid, ticketRef } from "../util/ids.js";
import type { Ticket } from "../db.js";

export const chatReplyKey = (ticketId: number) => `chat_reply:${ticketId}`;
/** kv entries `manual_intake:<channelId>:<messageId>` are picked up by the 30s job (lets staff tools and scripts request a run) */
export const MANUAL_INTAKE_PREFIX = "manual_intake:";
/** kv entries `chat_pending:<channelId>:<messageId>` = {due, gate}: cautious captures waiting for staff to answer first */
export const PENDING_PREFIX = "chat_pending:";

let gatePrompt = "";
let botRoleId: string | null = null;

/** The tag must be written in the message: the bot's user OR its managed role. Reply pings don't count. */
function tagPattern(app: App): RegExp {
  const alts = [`<@!?${app.client.user.id}>`];
  if (botRoleId) alts.push(`<@&${botRoleId}>`);
  return new RegExp(alts.join("|"), "g");
}
export function botTagged(app: App, message: Message): boolean {
  return tagPattern(app).test(message.content);
}

export function registerChatIntake(app: App, systemPrompt: string, ticketQaPrompt = ""): void {
  gatePrompt = systemPrompt;
  setQaPrompt(ticketQaPrompt);
  if (!app.ai) {
    app.log.warn("chat intake enabled but AI triage is off; chat intake will not run (keywords are too blunt for this)");
    return;
  }
  // members often pick the "support-bot" role from autocomplete instead of the user; accept both
  void app.client.guilds
    .fetch(app.cfg.guild_id)
    .then((g) => g.members.fetchMe())
    .then((me) => {
      botRoleId = me.roles.botRole?.id ?? null;
    })
    .catch((err) => app.log.warn({ err }, "could not resolve the bot's managed role"));
  app.client.on(Events.MessageCreate, (m) => void handle(app, systemPrompt, m));
  app.log.info({ enabled: app.cfg.chat_intake.enabled, channels: app.cfg.chat_intake.channel_ids, minConfidence: app.cfg.chat_intake.min_confidence }, "chat intake watching (plus @mentions anywhere)");
}

export type IntakeOutcome = { outcome: "issue" | "idea"; ticketId: number } | { outcome: "silent"; reason: string } | { outcome: "skipped"; reason: string };

/**
 * Never reply in the channel: every response goes in a thread started on the message it is about,
 * so #ask-staff stays a clean list of messages with a thread badge under the ones the bot handled.
 */
async function threadOn(app: App, message: Message, name: string): Promise<ThreadChannel> {
  // already inside a thread: answer right here (Discord has no threads inside threads)
  if (message.channel.isThread()) return message.channel;
  if (message.hasThread) {
    const existing = message.thread ?? (await app.client.channels.fetch(message.id).catch(() => null));
    if (existing && existing.isThread()) {
      if (existing.archived) await existing.setArchived(false).catch(() => undefined);
      return existing;
    }
  }
  return message.startThread({ name: name.slice(0, 100), autoArchiveDuration: ThreadAutoArchiveDuration.OneDay, reason: "support-bot intake" });
}

function snippet(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > 60 ? `${one.slice(0, 57)}...` : one;
}

/** Post the capture confirmation (with Undo) in a thread on the member's message. */
/** `mentionAuthor`: only on automatic captures. When someone tagged the bot, a person is already talking to them in the thread. */
async function confirmInThread(app: App, message: Message, t: Ticket, decision: "issue" | "idea", mentionAuthor: boolean): Promise<void> {
  const thread = await threadOn(app, message, `${ticketRef(t.id)} · ${t.title ?? snippet(message.content)}`);
  const undo = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(cid("chat", "undo", t.id))
      .setLabel("Undo")
      .setEmoji("↩️")
      .setStyle(ButtonStyle.Secondary),
  );
  const body = decision === "idea" ? chatIntakeIdeaReply(t) : chatIntakeReply(t);
  const content = mentionAuthor ? `<@${message.author.id}> ${body}` : body;
  const sent = await thread.send({ content, components: [undo], allowedMentions: { users: mentionAuthor ? [message.author.id] : [], roles: [] } });
  app.db.kvSet(chatReplyKey(t.id), `${thread.id}:${sent.id}`);
}

/** A short bot note in a thread on the tagging message (for @mentions that didn't capture anything). */
async function noteInThread(app: App, message: Message, content: string): Promise<void> {
  const thread = await threadOn(app, message, `support-bot · ${snippet(message.content.replace(/<@!?\d+>/g, "")) || "note"}`);
  await thread.send({ content, allowedMentions: { parse: [] } });
}

async function confirmationExists(app: App, ticketId: number): Promise<boolean> {
  const ref = app.db.kvGet(chatReplyKey(ticketId));
  if (!ref) return false;
  const [channelId, messageId] = ref.split(":");
  if (!channelId || !messageId) return false;
  return (await fetchMessage(app.client, channelId, messageId).catch(() => null)) !== null;
}

export interface RunOptions {
  /** staff asked (tag by staff, /mox intake): bypass every filter and always capture */
  force?: boolean;
  /** a member tagged the bot: bypass the pre-filter, capture unless clearly not a request */
  tagged?: boolean;
  /** use this text instead of message.content (e.g. with the bot mention stripped) */
  content?: string;
  /** a gate answer from earlier (deferred captures); skips the model call */
  gate?: ChatGateOutput | null;
  /** the wait is over: capture now instead of deferring again */
  afterWait?: boolean;
  /** messages whose photos belong to this report (e.g. the reporter's follow-ups in a thread) */
  photosFrom?: Message[];
}

/** Run intake on any message, live or old. */
export async function runIntakeOn(app: App, message: Message, opts: RunOptions = {}): Promise<IntakeOutcome> {
  const force = opts.force ?? false;
  const tagged = opts.tagged ?? false;
  const asked = force || tagged; // a person explicitly pointed the bot at this message
  const text = (opts.content ?? message.content).trim();
  if (!app.ai) return { outcome: "skipped", reason: "AI triage is off" };
  if (message.author.bot) return { outcome: "skipped", reason: "bot message" };
  if (!asked && !worthClassifying(app.cfg, { content: text, channelId: message.channelId, authorIsBot: message.author.bot, inThread: message.channel.isThread(), isSystem: message.system }))
    return { outcome: "skipped", reason: "not a watched channel, in a thread, or too short" };
  if (!text) return { outcome: "skipped", reason: "empty message" };
  const already = app.db.kvGet(`chat_intaken:${message.id}`);
  if (already) {
    const prev = app.db.getTicket(Number(already));
    if (prev && asked && prev.status !== "not_a_ticket" && !(await confirmationExists(app, prev.id))) {
      const d = prev.kind === "idea" ? "idea" : "issue";
      await confirmInThread(app, message, prev, d, false);
      return { outcome: d, ticketId: prev.id };
    }
    return { outcome: "skipped", reason: `already captured as ${prev ? ticketRef(prev.id) : `ticket ${already}`}` };
  }

  let gate: ChatGateOutput | null;
  if (opts.gate !== undefined) gate = opts.gate;
  else {
    const authorIsStaff = await isStaffUser(app.client, app.cfg, message.author.id);
    gate = await app.ai.classifyChat(gatePrompt, text, authorIsStaff);
    app.db.recordEvent(0, "chat_gate", message.author.id, null, { kind: gate?.kind ?? null, category: gate?.category ?? null, confidence: gate?.confidence ?? null, manual: force });
  }
  const decision = intakeDecision(app.cfg, gate, { force, tagged });
  if (!decision) return { outcome: "silent", reason: gate ? `${gate.kind} ${gate.category ?? ""} at ${gate.confidence.toFixed(2)}: ${gate.reason}` : "model returned nothing" };

  // Stocking and ideas: give staff the first word. Building problems are captured straight away.
  const wait = app.cfg.chat_intake.cautious.wait_minutes;
  if (!asked && !opts.afterWait && wait > 0 && isCautious(app.cfg, decision, gate)) {
    const due = new Date(Date.now() + wait * 60_000).toISOString();
    app.db.kvSet(`${PENDING_PREFIX}${message.channelId}:${message.id}`, JSON.stringify({ due, gate }));
    app.log.info({ message: message.id, decision, category: gate?.category, wait }, "chat intake waiting for staff to answer first");
    return { outcome: "silent", reason: `waiting ${wait} min for staff to answer first` };
  }

  const member = message.member;
  const draft = {
    source: "chat" as const,
    reporterId: message.author.id,
    reporterName: member?.displayName ?? message.author.displayName ?? message.author.username,
    contact: { kind: "discord" as const, value: message.author.id },
    description: text,
    location: gate?.location?.trim() || "Not stated",
    visibility: "private" as const,
    urgent: false,
    sourceMessageUrl: message.url,
  };
  const t = await createTicket(app, draft, decision === "idea" ? { presetKind: "idea" } : {});
  // triage may still turn an "issue" into an idea; confirm what it actually became
  const final: "issue" | "idea" = t.kind === "idea" ? "idea" : "issue";
  app.db.recordEvent(t.id, "chat_intake", message.author.id, null, { decision: final, gate: decision, confidence: gate?.confidence ?? null, category: gate?.category ?? null, forced: force });

  for (const m of [message, ...(opts.photosFrom ?? [])]) {
    if (m.attachments.size) await ingestPhotos(app, t.id, m, { quiet: true }).catch((err) => app.log.warn({ err }, "photo capture failed"));
  }
  await confirmInThread(app, message, t, final, !asked);
  app.db.kvSet(`chat_intaken:${message.id}`, String(t.id));
  app.log.info({ ticket: t.id, decision: final, confidence: gate?.confidence ?? null, category: gate?.category ?? null, manual: force }, "chat intake captured");
  return { outcome: final, ticketId: t.id };
}

async function handle(app: App, _systemPrompt: string, message: Message): Promise<void> {
  try {
    if (message.author.bot) return;
    if (!botTagged(app, message)) {
      await runIntakeOn(app, message, { force: false });
      return;
    }
    await handleTag(app, message);
  } catch (err) {
    app.log.error({ err }, "chat intake failed");
  }
}

/** Which ticket, if any, a tagged message is asking about. */
async function ticketBeingAskedAbout(app: App, message: Message, stripped: string): Promise<Ticket | null> {
  if (message.channel.isThread()) {
    const t = app.db.getTicketByThread(message.channel.id);
    if (t) return t;
  }
  if (message.reference?.messageId) {
    const t = app.db.getTicketByMessage(message.reference.messageId);
    if (t) return t;
  }
  const id = parseTicketRef(stripped);
  return id !== null ? app.db.getTicket(id) ?? null : null;
}

/** The tagger's own message just before this one (same channel or thread), within a few minutes. */
async function previousOwnMessage(app: App, message: Message, withinMinutes: number): Promise<Message | null> {
  const before = await message.channel.messages.fetch({ before: message.id, limit: 15 }).catch(() => null);
  const cutoff = message.createdTimestamp - withinMinutes * 60_000;
  for (const m of before?.values() ?? []) {
    if (m.createdTimestamp < cutoff) break;
    if (m.author.id !== message.author.id || m.system || !m.content.trim() || botTagged(app, m)) continue;
    return m;
  }
  return null;
}

/**
 * Someone wrote @support-bot. Work out which message they mean, flexibly:
 *   reply to a message + bare tag     -> the replied-to message
 *   tag + description (reply or not)  -> this message
 *   tag on its own                    -> their own message just above, else the thread's first post
 * Staff tags always capture; member tags capture unless it's clearly not a request.
 */
export async function handleTag(app: App, message: Message): Promise<void> {
  const stripped = message.content.replace(tagPattern(app), "").trim();

  // A question about an existing ticket? (asked in its thread, in reply to its card/digest line, or naming MOX-123)
  const about = await ticketBeingAskedAbout(app, message, stripped);
  if (about) {
    await handleTicketMention(app, message, about, stripped, async (text) => {
      if (message.channel.isThread()) await message.channel.send({ content: text, allowedMentions: { parse: [] } });
      else await noteInThread(app, message, text);
    });
    return;
  }

  let target: Message = message;
  let content = stripped;
  let photosFrom: Message[] = [];
  if (message.reference?.messageId && tagMeansReferencedMessage(app.cfg, stripped)) {
    const ref = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    if (ref && !ref.author.bot && ref.content.trim()) {
      target = ref;
      content = ref.content;
    }
  } else if (!stripped) {
    const own = await previousOwnMessage(app, message, 15);
    if (own) {
      target = own;
      content = own.content;
    } else if (message.channel.isThread()) {
      const starter = await message.channel.fetchStarterMessage().catch(() => null);
      if (starter && !starter.author.bot) {
        // the report is often the thread's title line plus what the same person wrote inside it
        const inside = [...(await message.channel.messages.fetch({ before: message.id, limit: 30 }).catch(() => new Map())).values()]
          .filter((m: Message) => m.author.id === starter.author.id && !m.system && m.id !== starter.id && !botTagged(app, m))
          .sort((a: Message, b: Message) => a.createdTimestamp - b.createdTimestamp);
        target = starter;
        content = joinReporterParts([starter.content, ...inside.map((m: Message) => m.content)]);
        photosFrom = inside.filter((m: Message) => m.attachments.size > 0);
      }
    }
  }
  if (!content.trim()) {
    await noteInThread(app, message, chatIntakeTagHelp(app.cfg));
    return;
  }
  const taggerIsStaff = await isStaffUser(app.client, app.cfg, message.author.id);
  const r = await runIntakeOn(app, target, taggerIsStaff ? { force: true, content, photosFrom } : { tagged: true, content, photosFrom });
  app.log.info({ tagger: message.author.id, staff: taggerIsStaff, target: target.id, ...r }, "tag handled");
  if (r.outcome === "silent") await noteInThread(app, message, chatIntakeNotAnIssue(app.cfg));
  else if (r.outcome === "skipped") await noteInThread(app, message, `Nothing to do: ${r.reason}.`);
  // issue / idea: runIntakeOn already confirmed in a thread on the captured message
}

/** Did a staff member answer this message: in its thread, or as a reply to it? */
async function staffAnswered(app: App, message: Message): Promise<boolean> {
  const isStaff = async (id: string) => id !== app.client.user.id && (await isStaffUser(app.client, app.cfg, id));
  if (message.hasThread) {
    const thread = message.thread ?? (await app.client.channels.fetch(message.id).catch(() => null));
    if (thread && thread.isThread()) {
      for (const m of (await thread.messages.fetch({ limit: 50 })).values()) if (!m.system && (await isStaff(m.author.id))) return true;
    }
  }
  const later = await message.channel.messages.fetch({ after: message.id, limit: 100 }).catch(() => null);
  for (const m of later?.values() ?? []) if (m.reference?.messageId === message.id && (await isStaff(m.author.id))) return true;
  return false;
}

/** Cautious captures whose wait is over: capture only if staff haven't already handled it. */
export async function drainPendingIntake(app: App): Promise<void> {
  const now = Date.now();
  for (const { key, value } of app.db.kvList(PENDING_PREFIX)) {
    let entry: { due: string; gate: ChatGateOutput | null };
    try {
      entry = JSON.parse(value);
    } catch {
      app.db.kvDel(key);
      continue;
    }
    if (new Date(entry.due).getTime() > now) continue;
    app.db.kvDel(key);
    const [, channelId, messageId] = key.split(":");
    try {
      const ch = await app.client.channels.fetch(channelId!);
      if (!ch || !ch.isTextBased()) continue;
      const msg = await ch.messages.fetch(messageId!).catch(() => null);
      if (!msg) continue; // deleted while we waited
      if (await staffAnswered(app, msg)) {
        app.db.recordEvent(0, "chat_staff_answered", msg.author.id, null, { message: msg.id, category: entry.gate?.category ?? null });
        app.log.info({ message: msg.id }, "chat intake: staff answered first, staying out");
        continue;
      }
      const r = await runIntakeOn(app, msg, { gate: entry.gate, afterWait: true });
      app.log.info({ message: msg.id, ...r }, "chat intake after wait");
    } catch (err) {
      app.log.error({ err, key }, "pending intake failed");
    }
  }
}

/** Drain `manual_intake:<channelId>:<messageId>` requests (from /mox intake or a script). */
export async function drainManualIntake(app: App): Promise<void> {
  for (const { key } of app.db.kvList(MANUAL_INTAKE_PREFIX)) {
    app.db.kvDel(key);
    const [, channelId, messageId] = key.split(":");
    if (!channelId || !messageId) continue;
    try {
      const ch = await app.client.channels.fetch(channelId);
      if (!ch || !ch.isTextBased()) continue;
      const msg = await ch.messages.fetch(messageId);
      // a message that tags the bot is replayed as a tag (so a tag missed while the bot was down still works)
      if (!msg.author.bot && botTagged(app, msg)) {
        await handleTag(app, msg);
        app.log.info({ channelId, messageId }, "manual intake: replayed a tag");
        continue;
      }
      const r = await runIntakeOn(app, msg, { force: true });
      app.log.info({ channelId, messageId, ...r }, "manual intake");
    } catch (err) {
      app.log.error({ err, key }, "manual intake failed");
    }
  }
}
