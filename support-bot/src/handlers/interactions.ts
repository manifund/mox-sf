/**
 * One dispatcher for every button, select, modal and slash command.
 * custom_id grammar: mox:<ns>:<action>[:<ticket>[:<extra>]] — see util/ids.ts.
 */
import {
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type Interaction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import type { App } from "../app.js";
import { staffMap, type OwnerKey } from "../config.js";
import * as actions from "../core/actions.js";
import { createTicket } from "../core/createTicket.js";
import { postInThread } from "../core/flow.js";
import { refreshSurfaces } from "../cards.js";
import { chatReplyKey, runIntakeOn } from "./chatIntake.js";
import { postIssueDigest } from "../jobs/issueDigest.js";
import { fetchMessage } from "../discord.js";
import { chatIntakeUndone, ideaAck } from "../render.js";
import { isStaffMember } from "../discord.js";
import {
  MODAL_FIELDS,
  logReply,
  prioritySelect,
  reassignSelect,
  reportModal,
  wontDoModal,
} from "../render.js";
import { parseCid, ticketRef } from "../util/ids.js";
import { isoDaysAgo } from "../util/time.js";

const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const;

function actorOf(i: Interaction): actions.Actor {
  const member = i.member as GuildMember | null;
  return { id: i.user.id, name: member?.displayName ?? i.user.displayName ?? i.user.username };
}

function staff(app: App, i: Interaction): boolean {
  return isStaffMember(app.cfg, i.member as GuildMember | null);
}

export function registerInteractions(app: App): void {
  app.client.on("interactionCreate", async (i) => {
    try {
      if (i.isChatInputCommand()) return await onCommand(app, i);
      if (i.isButton()) return await onButton(app, i);
      if (i.isStringSelectMenu()) return await onSelect(app, i);
      if (i.isModalSubmit()) return await onModal(app, i);
    } catch (err) {
      app.log.error({ err, type: i.type, id: i.id }, "interaction failed");
      try {
        if (i.isRepliable()) {
          if (i.deferred || i.replied) await i.followUp({ content: "Something went wrong on my end — staff have been alerted. Your report is still saved.", ...EPHEMERAL });
          else await i.reply({ content: "Something went wrong on my end — staff have been alerted. Your report is still saved.", ...EPHEMERAL });
        }
      } catch {
        /* ignore */
      }
    }
  });
}

// ─── buttons ────────────────────────────────────────────────────────────────

async function onButton(app: App, i: ButtonInteraction): Promise<void> {
  const c = parseCid(i.customId);
  if (!c) return;

  if (c.ns === "report") {
    await i.showModal(reportModal());
    return;
  }

  const t = c.ticketId !== null ? app.db.getTicket(c.ticketId) : undefined;
  if (!t) {
    await i.reply({ content: "I can't find that ticket any more.", ...EPHEMERAL });
    return;
  }
  const isReporter = i.user.id === t.reporter_id;
  const isStaff = staff(app, i);

  switch (c.ns) {
    case "chat": {
      if (c.action !== "undo") return;
      if (!isReporter && !isStaff) return void (await i.reply({ content: "Only the person who posted it or staff can undo this.", ...EPHEMERAL }));
      await i.update({ content: chatIntakeUndone(ticketRef(t.id)), components: [] });
      await actions.markNotATicket(app, t, isStaff && !isReporter ? actorOf(i) : null);
      return;
    }
    case "dupe": {
      if (!isReporter && !isStaff) return void (await i.reply({ content: "Only the reporter can answer this.", ...EPHEMERAL }));
      await i.update({ components: [] });
      if (c.action === "yes") await actions.acceptDuplicate(app, t);
      else await actions.declineDuplicate(app, t);
      return;
    }
    case "q": {
      if (!isReporter && !isStaff) return void (await i.reply({ content: "Only the reporter can answer this.", ...EPHEMERAL }));
      await i.update({ components: [] });
      if (c.action === "issue") await actions.keepAsIssue(app, t);
      else await actions.markNotATicket(app, t, null);
      return;
    }
    case "staff": {
      if (!isStaff) return void (await i.reply({ content: "Staff only.", ...EPHEMERAL }));
      switch (c.action) {
        case "reassign":
          return void (await i.reply({ ...reassignSelect(app.cfg, t), ...EPHEMERAL }));
        case "wontdo":
          return void (await i.showModal(wontDoModal(t.id)));
        case "priority":
          return void (await i.reply({ ...prioritySelect(t), ...EPHEMERAL }));
        case "notticket":
          await i.reply({ content: `Marked ${ticketRef(t.id)} as not a ticket.`, ...EPHEMERAL });
          await actions.markNotATicket(app, t, actorOf(i));
          return;
      }
    }
  }
}

// ─── selects ────────────────────────────────────────────────────────────────

async function onSelect(app: App, i: StringSelectMenuInteraction): Promise<void> {
  const c = parseCid(i.customId);
  if (!c || c.ns !== "sel" || c.ticketId === null) return;
  if (!staff(app, i)) return void (await i.reply({ content: "Staff only.", ...EPHEMERAL }));
  const t = app.db.getTicket(c.ticketId);
  if (!t) return void (await i.update({ content: "Ticket not found.", components: [] }));
  const value = i.values[0]!;
  if (c.action === "reassign") {
    await i.update({ content: `Reassigning ${ticketRef(t.id)}…`, components: [] });
    await actions.reassign(app, t, value as OwnerKey, actorOf(i));
    await i.editReply({ content: `↪️ ${ticketRef(t.id)} reassigned to **${actions.ownerDisplay(app.cfg, value)}**.` });
  } else if (c.action === "priority") {
    await i.update({ content: `Updating ${ticketRef(t.id)}…`, components: [] });
    await actions.setPriority(app, t, value as "P0" | "P1" | "P2", actorOf(i));
    await i.editReply({ content: `⚙️ ${ticketRef(t.id)} is now ${value}.` });
  }
}

// ─── modals ─────────────────────────────────────────────────────────────────

async function onModal(app: App, i: ModalSubmitInteraction): Promise<void> {
  const c = parseCid(i.customId);
  if (!c || c.ns !== "modal") return;

  if (c.action === "report") {
    await i.deferReply(EPHEMERAL);
    const member = i.member as GuildMember | null;
    const t = await createTicket(app, {
      source: "discord",
      reporterId: i.user.id,
      reporterName: member?.displayName ?? i.user.displayName ?? i.user.username,
      contact: { kind: "discord", value: i.user.id },
      description: i.fields.getTextInputValue(MODAL_FIELDS.what),
      location: i.fields.getTextInputValue(MODAL_FIELDS.where),
      context: i.fields.getTextInputValue(MODAL_FIELDS.context) || undefined,
      visibility: "private",
      urgent: safeCheckbox(i, MODAL_FIELDS.urgent),
    });
    if (t.kind === "idea") {
      await i.editReply({ content: ideaAck(t.id) }); // ideas go straight on the board, no thread
      return;
    }
    const link = t.thread_id ? `<#${t.thread_id}>` : "your thread";
    await i.editReply({ content: `Got it. **${ticketRef(t.id)}** is open in ${link}; updates will land there.` });
    return;
  }

  if (c.action === "wontdo" && c.ticketId !== null) {
    if (!staff(app, i)) return void (await i.reply({ content: "Staff only.", ...EPHEMERAL }));
    const t = app.db.getTicket(c.ticketId);
    if (!t) return void (await i.reply({ content: "Ticket not found.", ...EPHEMERAL }));
    const reason = i.fields.getTextInputValue("reason").trim();
    await i.deferReply(EPHEMERAL);
    await actions.wontDo(app, t, reason, actorOf(i));
    await i.editReply({ content: `🚫 ${ticketRef(t.id)} closed as won't do. The reporter has been told.` });
  }
}

function safeCheckbox(i: ModalSubmitInteraction, id: string): boolean {
  try {
    return i.fields.getCheckbox(id);
  } catch {
    return false; // older clients may omit an unticked checkbox entirely
  }
}

// ─── slash commands ─────────────────────────────────────────────────────────

async function onCommand(app: App, i: ChatInputCommandInteraction): Promise<void> {
  if (!staff(app, i)) return void (await i.reply({ content: "Staff only.", ...EPHEMERAL }));

  if (i.commandName === "log") {
    const invoker = actorOf(i);
    const asked = i.options.getUser("asked_by");
    const ownerKey = staffMap(app.cfg)[i.user.id] ?? "unassigned";
    const t = actions.staffLog(app, {
      what: i.options.getString("what", true),
      where: i.options.getString("where"),
      askedBy: asked ? { id: asked.id, name: asked.displayName ?? asked.username } : null,
      minutes: i.options.getInteger("minutes"),
      invoker,
      ownerKey,
    });
    const weekCount = app.db.countLoggedThisWeekBy(invoker.name, isoDaysAgo(7));
    await i.reply({ content: logReply(t.id, weekCount), ...EPHEMERAL });
    app.queue.schedule();
    return;
  }

  if (i.commandName === "mox") {
    const sub = i.options.getSubcommand();
    if (sub === "requeue") {
      await i.deferReply(EPHEMERAL);
      await app.queue.rebuild();
      await i.editReply({ content: "📋 Standing queue rebuilt." });
      return;
    }
    if (sub === "resync") {
      const id = i.options.getInteger("ticket", true);
      const t = app.db.getTicket(id);
      if (!t) return void (await i.reply({ content: `No ticket ${ticketRef(id)}.`, ...EPHEMERAL }));
      app.mirror.enqueueUpsert(t);
      await refreshSurfaces(app, t.id);
      await i.reply({ content: `🔄 ${ticketRef(id)} queued for Airtable and every card refreshed.`, ...EPHEMERAL });
      return;
    }
    if (sub === "pin") {
      await i.deferReply(EPHEMERAL);
      await app.pinnedPost.ensure();
      await i.editReply({ content: "📌 Pinned post is in place." });
      return;
    }
    if (sub === "intake") {
      const ref = i.options.getString("message", true).trim();
      const m = /channels\/\d+\/(\d+)\/(\d+)/.exec(ref);
      const channelId = m?.[1] ?? i.channelId;
      const messageId = m?.[2] ?? ref;
      if (!/^\d{15,22}$/.test(messageId)) return void (await i.reply({ content: "Give me a message link or a message id.", ...EPHEMERAL }));
      await i.deferReply(EPHEMERAL);
      try {
        const ch = await app.client.channels.fetch(channelId);
        if (!ch || !ch.isTextBased()) throw new Error("channel not found");
        const msg = await ch.messages.fetch(messageId);
        const r = await runIntakeOn(app, msg, { force: true });
        const text =
          "ticketId" in r
            ? `${r.outcome === "idea" ? "💡" : "🔧"} Captured as ${ticketRef(r.ticketId)} (${r.outcome}).`
            : `${r.outcome === "silent" ? "Stayed silent" : "Skipped"}: ${r.reason}`;
        await i.editReply({ content: text });
      } catch (err) {
        await i.editReply({ content: `Couldn't run intake: ${(err as Error).message}` });
      }
      return;
    }
    if (sub === "digest") {
      await i.deferReply(EPHEMERAL);
      const r = await postIssueDigest(app);
      await i.editReply({ content: `📋 Digest posted in <#${app.cfg.digest.channel_id}>: ${r.open} open, ${r.closed} closed today, ${r.ideas} ideas.` });
      return;
    }
    if (sub === "status") {
      const open = app.db.listOpen().length;
      const depth = app.db.mirrorQueueDepth();
      await i.reply({
        content: `v${app.version} · up ${Math.round((Date.now() - app.startedAt.getTime()) / 60000)} min · ${open} open · Airtable queue ${depth} · triage ${app.triage.aiEnabled ? "AI" : "keywords only"} (${app.triage.consecutiveFallbacks} consecutive fallbacks)`,
        ...EPHEMERAL,
      });
      return;
    }
  }
}

export { postInThread };
