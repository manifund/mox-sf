/**
 * "@support-bot make MOX-118 important and give it to Carolina." Staff instructions about a ticket.
 * The model only classifies the instruction; carrying it out goes through the same actions as the card's
 * buttons, so reporter updates, Airtable and every card stay consistent. Members can only ask questions.
 */
import fs from "node:fs";
import path from "node:path";
import type { Message } from "discord.js";
import type { App } from "./app.js";
import { ownerDisplay, type OwnerKey } from "./config.js";
import * as actions from "./core/actions.js";
import type { Ticket } from "./db.js";
import { displayNameOf, isStaffUser } from "./discord.js";
import { PRIORITY_LABEL, STATUS_LABEL, threadUrl } from "./render.js";
import { answerAboutTicket } from "./ticketQa.js";
import type { TicketCommand } from "./triage/ai.js";
import { ticketRef } from "./util/ids.js";

let promptCache: string | null = null;
function commandPrompt(app: App): string {
  if (promptCache === null) promptCache = fs.readFileSync(path.resolve(app.cfg.ticket_qa.command_prompt_path), "utf8");
  return promptCache;
}

export type Plan =
  | { op: "answer" }
  | { op: "promote"; priority: "P0" | "P1" | "P2"; owner?: OwnerKey }
  | { op: "set_priority"; priority: "P0" | "P1" | "P2"; owner?: OwnerKey }
  | { op: "reassign"; owner: OwnerKey; priority?: "P0" | "P1" | "P2" }
  | { op: "close" }
  | { op: "wont_do"; reason: string }
  | { op: "to_idea" }
  | { op: "close_idea" }
  | { op: "decline_idea"; reason: string }
  | { op: "refuse"; why: string };

/**
 * Pure: given the ticket's state and the classified instruction, what will actually happen?
 * `ownerNamed` = owner keys the staff member actually named; a model-chosen owner nobody named is dropped,
 * so routing decides instead of a guess.
 */
export function planCommand(validOwners: string[], t: Pick<Ticket, "status" | "kind" | "priority" | "owner_key">, c: TicketCommand | null, ownerNamed?: (key: string) => boolean): Plan {
  if (!c || c.action === "answer") return { op: "answer" };
  const named = !c.owner || !ownerNamed || ownerNamed(c.owner);
  const owner = c.owner && named && validOwners.includes(c.owner) && c.owner !== "unassigned" ? (c.owner as OwnerKey) : undefined;
  if (c.owner && named && !owner) return { op: "refuse", why: `there's no owner called "${c.owner}"` };
  const isIdea = t.status === "logged";
  const isOpen = t.status === "routed" || t.status === "claimed";
  const closed = !isIdea && !isOpen;
  if (closed) return { op: "refuse", why: `it's already ${STATUS_LABEL[t.status as keyof typeof STATUS_LABEL] ?? t.status}` };
  switch (c.action) {
    case "make_idea":
      if (isIdea) return { op: "refuse", why: "it's already on the ideas list" };
      return { op: "to_idea" };
    case "make_work_item":
      if (!isIdea) return { op: "refuse", why: "it's already a work item" };
      return { op: "promote", priority: c.priority ?? "P2", owner };
    case "set_priority":
      if (!c.priority) return { op: "refuse", why: "I couldn't tell which priority you meant" };
      return isIdea ? { op: "promote", priority: c.priority, owner } : { op: "set_priority", priority: c.priority, owner };
    case "reassign":
      if (!owner) return { op: "refuse", why: "I couldn't tell who it should go to. Name them, e.g. \"give it to Carolina\"" };
      return isIdea ? { op: "promote", priority: c.priority ?? "P2", owner } : { op: "reassign", owner, priority: c.priority ?? undefined };
    case "close":
      return isIdea ? { op: "close_idea" } : { op: "close" };
    case "wont_do":
      if (!c.reason) return { op: "refuse", why: "a won't-do needs a reason, e.g. \"won't do, out of scope\"" };
      return isIdea ? { op: "decline_idea", reason: c.reason } : { op: "wont_do", reason: c.reason };
    default:
      return { op: "answer" };
  }
}

function stateLine(t: Ticket): string {
  return `${ticketRef(t.id)} · ${t.kind} · ${STATUS_LABEL[t.status]} · ${t.priority ? PRIORITY_LABEL[t.priority] : "no priority"} · owner ${t.owner_key ?? "none"}`;
}

/** Entry point for any tag about a ticket. Staff instructions are carried out; everything else is answered. */
export async function handleTicketMention(app: App, message: Message, t: Ticket, text: string, reply: (s: string) => Promise<void>): Promise<void> {
  const staff = await isStaffUser(app.client, app.cfg, message.author.id);
  let plan: Plan = { op: "answer" };
  if (staff && app.ai && text.trim()) {
    const c = await app.ai.ticketCommand(commandPrompt(app), `Ticket: ${stateLine(t)}\nWhat the reporter wrote: """${t.description.slice(0, 600)}"""\n\nStaff message: ${text}`);
    const lower = text.toLowerCase();
    const ownerNamed = (key: string) => {
      const names = [key.replace(/_/g, " "), ownerDisplay(app.cfg, key).toLowerCase(), ...(key === "all_staff" ? ["everyone", "all staff", "whole team"] : [])];
      return names.some((n) => lower.includes(n.toLowerCase()));
    };
    plan = planCommand(Object.keys(app.cfg.owners), t, c, ownerNamed);
    app.log.info({ ticket: t.id, command: c, plan }, "ticket instruction");
  }
  if (plan.op === "answer") return answerAboutTicket(app, message, t, text, reply);
  if (plan.op === "refuse") return reply(`I didn't change **${ticketRef(t.id)}**: ${plan.why}.`);

  const by = { id: message.author.id, name: await displayNameOf(app.client, app.cfg, message.author.id) };
  switch (plan.op) {
    case "promote":
      await actions.promoteIdea(app, t, { priority: plan.priority, ownerKey: plan.owner }, by);
      break;
    case "set_priority":
      await actions.setPriority(app, t, plan.priority, by);
      if (plan.owner) await actions.reassign(app, app.db.getTicket(t.id)!, plan.owner, by);
      break;
    case "reassign":
      await actions.reassign(app, t, plan.owner, by);
      if (plan.priority) await actions.setPriority(app, app.db.getTicket(t.id)!, plan.priority, by);
      break;
    case "close":
      await actions.close(app, t, by);
      break;
    case "wont_do":
      await actions.wontDo(app, t, plan.reason, by);
      break;
    case "close_idea":
      await actions.closeIdea(app, t, by);
      break;
    case "to_idea":
      await actions.moveToIdeas(app, t, by);
      break;
    case "decline_idea":
      await actions.declineIdea(app, t, plan.reason, by);
      break;
  }
  const after = app.db.getTicket(t.id)!;
  const link = after.thread_id ? ` · [thread ↗](${threadUrl(app.cfg, after.thread_id)})` : "";
  const what =
    plan.op === "promote"
      ? `is now a work item: ${PRIORITY_LABEL[after.priority ?? "P2"]}, with **${ownerDisplay(app.cfg, after.owner_key)}**`
      : plan.op === "to_idea"
        ? "is on the ideas list now, unassigned. The owner's card is cleared"
        : plan.op === "close" || plan.op === "close_idea"
        ? "is marked done"
        : plan.op === "decline_idea"
          ? "is off the ideas list. The reason is on the board"
        : plan.op === "wont_do"
          ? "is closed as won't do. The reporter has been told why"
          : `is now ${after.priority ? PRIORITY_LABEL[after.priority] : "unprioritized"}, with **${ownerDisplay(app.cfg, after.owner_key)}**`;
  await reply(`Done: **${ticketRef(after.id)}** ${what}.${link}`);
}
