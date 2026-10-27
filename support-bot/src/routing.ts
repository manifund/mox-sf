/**
 * route() — pure. Decides WHO OWNS a ticket (§7.3). Delivery (where the card
 * lands) is a separate question answered by deliveryPlan() (§7.5).
 */
import type { Category, Config, Kind, OwnerKey, Priority, SuggestedOwner } from "./config.js";
import { isInsideHours } from "./util/time.js";

export interface RouteInput {
  ticketId: number;
  kind: Kind;
  category: Category;
  priority: Priority;
  now: Date;
  /** the model's pick; null on the keyword path */
  suggestedOwner: SuggestedOwner | string | null;
  /** confidence in the category; null on the keyword path */
  confidence: number | null;
}

export interface RouteResult {
  ownerKey: OwnerKey;
  routedBy: "category_map" | "ai_judgment" | null;
  /** which rule fired, for logs and tests */
  rule: "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7";
}

/** Even ticket number -> first in the rota, odd -> second (§7.2.1). */
export function rotaPick(cfg: Config, ticketId: number): OwnerKey {
  const rota = cfg.rota.facilities;
  if (rota.length === 1) return rota[0]!;
  return (ticketId % 2 === 0 ? rota[0] : rota[1]) ?? rota[0]!;
}

function timeBased(cfg: Config, now: Date): OwnerKey {
  return isInsideHours(now, cfg.claudio_hours) ? "claudio" : "contractors";
}

/** Resolve one of the model's owner names into a real queue, applying the guards in §7.3. */
function resolveSuggested(cfg: Config, suggested: string | null, input: RouteInput): OwnerKey {
  let s = suggested ?? cfg.triage.judgment_default_owner;
  if (s === "contractors") s = "claudio"; // the clock decides that, not the model
  if (s === "claudio" && cfg.category_owner[input.category] === "time_based") {
    const t = timeBased(cfg, input.now);
    return input.priority === "P0" && t === "contractors" ? rotaPick(cfg, input.ticketId) : t;
  }
  if (s === "facilities") return rotaPick(cfg, input.ticketId);
  if ((cfg.owners as Record<string, unknown>)[s] && s !== "unassigned") return s as OwnerKey;
  return cfg.triage.judgment_default_owner;
}

export function route(cfg: Config, input: RouteInput): RouteResult {
  // R1 — ideas are never owned
  if (input.kind === "idea") return { ownerKey: "unassigned", routedBy: null, rule: "R1" };

  // R2 — safety always goes to everyone
  if (input.category === "safety") return { ownerKey: "all_staff", routedBy: "category_map", rule: "R2" };

  // R3 — judgment tier: category doesn't settle it
  const floor = cfg.triage.category_confidence_floor;
  const lowConfidence = input.confidence !== null && input.confidence < floor;
  if (input.category === "other" || cfg.category_owner[input.category] === "ai_judgment" || lowConfidence) {
    return { ownerKey: resolveSuggested(cfg, input.suggestedOwner, input), routedBy: "ai_judgment", rule: "R3" };
  }

  const target = cfg.category_owner[input.category];

  // R4 / R5 — time-based
  if (target === "time_based") {
    const t = timeBased(cfg, input.now);
    if (t === "claudio") return { ownerKey: "claudio", routedBy: "category_map", rule: "R4" };
    // P0 never goes to the contractors — guard inside R5
    if (input.priority === "P0" && cfg.escalation.p0_never_to_contractors)
      return { ownerKey: rotaPick(cfg, input.ticketId), routedBy: "category_map", rule: "R5" };
    return { ownerKey: "contractors", routedBy: "category_map", rule: "R5" };
  }

  // R6 — facilities rota
  if (target === "facilities_rota") return { ownerKey: rotaPick(cfg, input.ticketId), routedBy: "category_map", rule: "R6" };

  // R7 — straight lookup
  return { ownerKey: target as OwnerKey, routedBy: "category_map", rule: "R7" };
}

// ─── delivery ──────────────────────────────────────────────────────────────

export interface DeliveryPlan {
  /** user ids to @-mention on the thread card (and any channel card) */
  mentionUserIds: string[];
  /** role id to mention (safety) */
  mentionRoleId: string | null;
  /** channel to post a second card in, or null when the thread card is the only surface */
  channelId: string | null;
  /** whether the owner is channel-based (Claudio / contractors) */
  channelBased: boolean;
}

/**
 * Where the notification lands (§7.5). Ordinary tickets never leave the thread;
 * P0 breaks out to the owner's team channel; channel-based owners get a card at every priority.
 */
export function deliveryPlan(cfg: Config, ownerKey: OwnerKey, priority: Priority): DeliveryPlan {
  const owner = cfg.owners[ownerKey];
  const none: DeliveryPlan = { mentionUserIds: [], mentionRoleId: null, channelId: null, channelBased: false };
  if (!owner || owner.delivery === "none" || priority === "P3") return none;

  let mentionUserIds = [...owner.mention_user_ids];
  // a P0 on the facilities rota mentions both halves (§7.2.1)
  if (priority === "P0" && cfg.rota.p0_mention_all && cfg.rota.facilities.includes(ownerKey)) {
    mentionUserIds = cfg.rota.facilities.flatMap((k) => cfg.owners[k]?.mention_user_ids ?? []);
  }
  const mentionRoleId = owner.mention_role_id ?? null;

  if (owner.delivery === "channel") {
    return { mentionUserIds, mentionRoleId, channelId: owner.channel_id ?? null, channelBased: true };
  }
  // delivery: thread
  return {
    mentionUserIds,
    mentionRoleId,
    channelId: priority === "P0" ? owner.p0_channel_id ?? null : null,
    channelBased: false,
  };
}

/** The user ids that should hear about a nudge for this owner (thread-delivery owners only get DMs). */
export function nudgeTargets(cfg: Config, ownerKey: OwnerKey, priority: Priority): string[] {
  return deliveryPlan(cfg, ownerKey, priority).mentionUserIds;
}
