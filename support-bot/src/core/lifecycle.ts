/**
 * The only place `status` is mutated (§5.1). Every other module asks this one.
 */
import type { Db, Status, Ticket, TicketPatch } from "../db.js";
import { nowIso } from "../util/time.js";

export const TRANSITIONS: Record<Status, Status[]> = {
  new: ["routed", "duplicate", "not_a_ticket", "logged"],
  // logged = staff decided it's an idea / nice-to-have, not work
  routed: ["claimed", "done", "won't_do", "duplicate", "logged"],
  claimed: ["done", "routed", "won't_do", "duplicate", "logged"],
  done: ["routed"],
  // routed = staff made it a work item; done = it was simply done; not_a_ticket = undone or declined
  logged: ["routed", "not_a_ticket", "done"],
  "won't_do": [],
  duplicate: [],
  not_a_ticket: [],
};

export class TransitionError extends Error {
  constructor(
    public readonly from: Status,
    public readonly to: Status,
    reason?: string,
  ) {
    super(`Illegal transition ${from} -> ${to}${reason ? `: ${reason}` : ""}`);
  }
}

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Pure check used by both the mutator and the tests. */
export function assertTransition(t: Pick<Ticket, "status" | "kind" | "category" | "priority" | "owner_key">, to: Status): void {
  if (!canTransition(t.status, to)) throw new TransitionError(t.status, to);
  if (to === "routed") {
    const missing = (["kind", "category", "priority", "owner_key"] as const).filter((k) => t[k] === null || t[k] === undefined);
    if (missing.length) throw new TransitionError(t.status, to, `missing ${missing.join(", ")}`);
  }
}

/**
 * Apply a status change plus any accompanying columns. Timestamps that belong
 * to the destination state are filled in automatically.
 */
export function transition(db: Db, ticket: Ticket, to: Status, patch: TicketPatch = {}, actor: string | null = null): Ticket {
  const merged = { ...ticket, ...patch };
  assertTransition(merged, to);
  const now = nowIso();
  const extra: TicketPatch = { status: to };
  switch (to) {
    case "routed":
      if (!merged.routed_at || ticket.status === "done" || ticket.status === "logged") extra.routed_at = now;
      if (ticket.status === "claimed" || ticket.status === "done") {
        extra.claimed_by = null;
        extra.claimed_at = null;
      }
      if (ticket.status === "done") {
        extra.closed_at = null;
        extra.closed_by = null;
        extra.reopen_count = ticket.reopen_count + 1;
      }
      break;
    case "claimed":
      extra.claimed_at = now;
      break;
    case "done":
    case "won't_do":
    case "duplicate":
      extra.closed_at = now;
      break;
    case "logged":
      extra.kind = "idea";
      extra.priority = "P3";
      extra.priority_source = "idea";
      extra.owner_key = "unassigned";
      extra.claimed_by = null;
      extra.claimed_at = null;
      break;
    default:
      break;
  }
  db.recordEvent(ticket.id, "status", actor, ticket.status, to);
  return db.updateTicket(ticket.id, { ...patch, ...extra });
}
