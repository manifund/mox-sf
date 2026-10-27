/**
 * TicketDraft -> row + thread + opener + triage kickoff (§2.4, §5.2).
 * Nothing downstream of here knows where a ticket came from.
 */
import { ChannelType, ThreadAutoArchiveDuration } from "discord.js";
import type { App } from "../app.js";
import type { Ticket } from "../db.js";
import { fetchSendable } from "../discord.js";
import { opsKeywordFallback, threadOpening } from "../render.js";
import { ticketRef } from "../util/ids.js";
import { applyTriage } from "./flow.js";
import { respectReporterUrgency } from "../triage/merge.js";
import { tidyWords, titleFromWords } from "../triage/wording.js";

export type TicketDraft = {
  source: "discord" | "web" | "staff_log" | "chat";
  reporterId: string | null;
  reporterName: string;
  contact: { kind: "discord" | "email" | "phone"; value: string };
  description: string;
  location: string;
  context?: string;
  /** always "private" since 2026-10-01; the column is kept so old rows still read */
  visibility: "private";
  /** the "This is urgent" checkbox on the modal */
  urgent: boolean;
  /** link to the member's original Discord message (chat intake / tags) */
  sourceMessageUrl?: string;
};

export const openerKey = (id: number) => `opener:${id}`;

export interface CreateOptions {
  /** false = never open a thread (ideas never get one regardless) */
  thread?: boolean;
  /** force the kind (chat gate said "idea"); the model still supplies title, summary and category */
  presetKind?: "idea";
}

/**
 * Private thread for a ticket: the reporter plus everyone holding Manage Threads on the parent channel
 * (C5, C6). Used at intake, and when staff turn an idea into a work item.
 */
export async function openTicketThread(app: App, t: Ticket, opts: { pingReporter: boolean }): Promise<Ticket> {
  if (t.thread_id) return t;
  const parent = await fetchSendable(app.client, app.cfg.channels.report_an_issue);
  if (!parent || parent.type !== ChannelType.GuildText) {
    app.log.error({ ticket: t.id }, "report channel missing or not a text channel; ticket has no thread");
    return t;
  }
  const thread = await parent.threads.create({
    name: `${ticketRef(t.id)} · ${titleFromWords(t.description)}`.slice(0, 100),
    type: ChannelType.PrivateThread,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    invitable: false,
    reason: `Ticket ${ticketRef(t.id)} by ${t.reporter_name}`,
  });
  t = app.db.updateTicket(t.id, { thread_id: thread.id });
  if (t.reporter_id) {
    try {
      await thread.members.add(t.reporter_id);
    } catch (err) {
      app.log.warn({ err, ticket: t.id }, "could not add reporter to thread");
    }
  }
  const ping = t.reporter_id && opts.pingReporter ? [t.reporter_id] : [];
  const opener = await thread.send({ ...threadOpening(t), allowedMentions: { users: ping } });
  app.db.kvSet(openerKey(t.id), opener.id);
  return t;
}

export async function createTicket(app: App, draft: TicketDraft, opts: CreateOptions = {}): Promise<Ticket> {
  let t = app.db.insertTicket({
    reporter_id: draft.reporterId,
    reporter_name: draft.reporterName,
    source: draft.source,
    contact_kind: draft.contact.kind,
    contact_value: draft.contact.value,
    description: tidyWords(draft.description),
    location: draft.location.trim(),
    context: draft.context?.trim() || null,
    visibility: "private",
    visibility_source: null,
    status: "new",
  });
  if (draft.urgent) t = app.db.updateTicket(t.id, { reported_priority: "P0" });
  if (draft.sourceMessageUrl) t = app.db.updateTicket(t.id, { source_message_url: draft.sourceMessageUrl });
  app.log.info({ ticket: t.id, source: draft.source, urgent: draft.urgent }, "ticket created");

  // Triage first (about 2s; the member sees "thinking"). An idea never gets a thread: it just goes on the board.
  const decision = await app.triage.run(t);
  if (opts.presetKind) decision.kind = opts.presetKind;
  decision.kind = respectReporterUrgency(decision.kind, draft.urgent); // ticked "urgent" is never an idea
  if (app.triage.consecutiveFallbacks >= 5) void app.ops.send("keyword_fallback", opsKeywordFallback());

  if (decision.kind !== "idea" && opts.thread !== false) {
    t = await openTicketThread(app, t, { pingReporter: draft.source !== "chat" });
  }

  await applyTriage(app, t.id, decision);
  return app.db.getTicket(t.id)!;
}