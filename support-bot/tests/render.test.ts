/** Smoke test: every render function produces payloads discord.js's builders accept. */
import { describe, expect, it } from "vitest";
import type { Ticket } from "../src/db.js";
import {
  chatIntakeIdeaReply,
  digestHeader,
  digestItemLine,
  digestLists,
  collapsedCard,
  ideaAck,
  introPost,
  duplicateOffer,
  pinnedPost,
  prioritySelect,
  questionRedirect,
  reassignSelect,
  reportModal,
  staffCard,
  standingQueue,
  threadOpening,
  weeklyDigest,
  wontDoModal,
} from "../src/render.js";
import { deliveryPlan } from "../src/routing.js";
import { cfg } from "./helpers.js";

const now = new Date().toISOString();
const ticket = (over: Partial<Ticket> = {}): Ticket =>
  ({
    id: 142,
    created_at: now,
    updated_at: now,
    routed_at: now,
    claimed_at: null,
    closed_at: null,
    reporter_id: "508408654698119168",
    reporter_name: "carolina",
    source: "discord",
    contact_kind: "discord",
    contact_value: "508408654698119168",
    description: "The coffee machine in the 4th floor kitchen won't turn on",
    location: "4th floor kitchen",
    context: "Tried the wall switch",
    kind: "issue",
    title: "Coffee machine won't turn on",
    staff_summary: "Coffee machine in the 4F kitchen won't power on; unplugged and retried.",
    category: "appliance",
    assessed_priority: "P1",
    suggested_owner: "facilities",
    owner_reasoning: null,
    routed_by: "category_map",
    triage_method: "ai",
    triage_confidence: 0.92,
    triage_reasoning: null,
    triaged_at: now,
    reported_priority: "P1",
    priority: "P1",
    priority_source: "reporter",
    owner_key: "jake",
    status: "routed",
    visibility: "private",
    visibility_source: null,
    made_public_at: null,
    made_public_by: null,
    mirror_channel_id: null,
    mirror_message_id: null,
    thread_id: "1545214670070091999",
    card_channel_id: null,
    card_message_id: null,
    mirror_record_id: null,
    claimed_by: null,
    closed_by: null,
    resolution_note: null,
    wont_do_reason: null,
    duplicate_of: null,
    reopen_count: 0,
    nudged_at: null,
    escalated_at: null,
    dupe_offer_of: null,
    dupe_offered_at: null,
    question_asked_at: null,
    question_resolved: 0,
    minutes_spent: null,
    closed_note_until: null,
    redirect_miss: 0,
    reporter_told_claim: null,
    ...over,
  }) as Ticket;

describe("render smoke", () => {
  it("pinned post, modals, opener serialise", () => {
    expect(pinnedPost().components[0]!.toJSON().components).toHaveLength(1); // one button, private issues only
    expect(introPost(cfg).content).toContain("how this works");
    expect(introPost(cfg).content.length).toBeLessThan(2000);
    expect(reportModal().toJSON().components).toHaveLength(4); // what, where, context, urgent checkbox
    expect(wontDoModal(142).toJSON().components).toHaveLength(1);
    // one line; the staff card that follows carries the rest
    for (const t of [ticket(), ticket({ source: "chat" }), ticket({ reported_priority: "P0" }), ticket({ kind: "idea" })]) {
      const o = threadOpening(t);
      expect(o.content.startsWith("Thanks <@508408654698119168>, this is **MOX-142**.")).toBe(true);
      expect(o.content).toContain("Drop a photo here");
      expect(o.content).toContain("Everyone on the Mox staff team can see this thread");
      expect(o.content).not.toMatch(/What:|Where:|Sizing this up|911/);
      expect(o.components).toHaveLength(0);
    }
  });

  it("staff card carries mentions in content, disagreement and judgment lines", () => {
    const t = ticket({ reported_priority: "P0", assessed_priority: "P1", priority: "P0", priority_source: "reporter", routed_by: "ai_judgment", owner_key: "carolina", owner_reasoning: "sounds like a member-experience thing" });
    const plan = deliveryPlan(cfg, "carolina", "P0");
    const card = staffCard({ cfg, ticket: t, photos: [], mentionUserIds: plan.mentionUserIds, mentionRoleId: plan.mentionRoleId, withThreadLink: true });
    expect(card.content).toBe(`<@${cfg.users.carolina}>`);
    const json = card.embeds[0]!.toJSON();
    expect(json.description).toContain("Reported Urgent · AI assessed Important");
    expect(json.description).toContain("🤔 Sent to Carolina");
    expect(json.title).toBe("MOX-142 · 🔴 Urgent");
    expect(card.components).toHaveLength(2);
    const labels = (card.components[0]!.toJSON().components as { label?: string }[]).map((c) => c.label);
    expect(labels).not.toContain("Make public");
    for (const row of card.components) row.toJSON();
  });

  it("safety card mentions the staff role; P0 facilities mentions both", () => {
    const safety = deliveryPlan(cfg, "all_staff", "P0");
    const card = staffCard({ cfg, ticket: ticket({ owner_key: "all_staff", category: "safety", priority: "P0" }), photos: [], mentionUserIds: safety.mentionUserIds, mentionRoleId: safety.mentionRoleId, withThreadLink: false });
    expect(card.content).toBe(`<@&${cfg.roles.mox_staff}>`);
    const fac = deliveryPlan(cfg, "jake", "P0");
    expect(fac.mentionUserIds).toEqual([cfg.users.jake]);
  });

  it("idea copy says it's in the queue, never that nobody is pinged", () => {
    for (const text of [chatIntakeIdeaReply(ticket()), ideaAck(142)]) {
      expect(text).toContain("added this to the queue as **MOX-142**");
      expect(text).not.toMatch(/pinged|—/);
    }
  });

  it("digest: one reactable line per open item, collapsing when closed; lists fit Discord", () => {
    const open = digestItemLine(cfg, ticket({ status: "routed" }));
    expect(open).toContain("**MOX-142**");
    expect(open).toContain("for Jake");
    expect(open).toContain("unclaimed");
    expect(digestItemLine(cfg, ticket({ status: "claimed", claimed_by: "Jake" }))).toContain("👀 Jake");
    expect(digestItemLine(cfg, ticket({ status: "done", closed_by: "Jake", closed_at: now })).startsWith("~~MOX-142")).toBe(true);
    expect(digestHeader("Thu, Oct 1", { open: 2, closed: 3, ideas: 1 })).toContain("react 👀 to claim it, ✅ when it's done");
    const many = Array.from({ length: 80 }, (_, i) => ticket({ id: 200 + i, status: "done", closed_by: "Jake" }));
    const chunks = digestLists(cfg, many, [ticket({ kind: "idea", status: "logged" })]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(2000);
    expect(chunks.join("\n")).toContain("Ideas and nice-to-haves");
    expect(chunks.join("\n")).not.toContain("—");
  });

  it("closed cards collapse to one struck-through line", () => {
    const done = collapsedCard(cfg, ticket({ status: "done", closed_by: "Jake", closed_at: now }));
    expect(done.startsWith("~~MOX-142 · Coffee machine won't turn on~~ ✅ Jake")).toBe(true);
    expect(collapsedCard(cfg, ticket({ status: "duplicate", duplicate_of: 138 }))).toContain("merged into MOX-138");
    expect(collapsedCard(cfg, ticket({ status: "won't_do", wont_do_reason: "not ours" }))).toContain("🚫");
  });

  it("selects and offers build; reassign never offers a departed owner", () => {
    const sel = reassignSelect(cfg, ticket({ owner_key: "jake" }));
    const menu = sel.components[0]!.toJSON().components[0] as { options: { value: string }[] };
    expect(menu.options.map((o) => o.value)).not.toContain("whit");
    expect(menu.options[0]!.value).toBe("jake");
    prioritySelect(ticket()).components[0]!.toJSON();
    duplicateOffer(ticket(), ticket({ id: 138, status: "claimed" })).components[0]!.toJSON();
    questionRedirect(ticket()).components[0]!.toJSON();
  });

  it("standing queue and digest stay under Discord limits", () => {
    const open = Array.from({ length: 60 }, (_, i) => ticket({ id: 100 + i, priority: i % 7 === 0 ? "P0" : i % 2 ? "P1" : "P2", owner_key: (["jake", "robin", "carolina", "claudio"] as const)[i % 4], status: i % 3 ? "routed" : "claimed", claimed_by: "Jake" }));
    const q = standingQueue(cfg, open, 3, 4, 25);
    expect(q.length).toBeLessThanOrEqual(4000);
    expect(q).toContain("📋 **Open right now** · 60 tickets");
    expect(q).toContain("more on the board");
    const d = weeklyDigest(cfg, {
      weekLabel: "22 September",
      closed: open.slice(0, 14),
      closedRecap: "Mostly plumbing.\n· Fixed the leak",
      byOwner: { jake: 9 },
      viaLog: 4,
      medianClose: "4h",
      open: open.slice(0, 6),
      ideasNew: 3,
      ideasTotal: 11,
      ideasOldestAge: "6w",
      signals: { p0Rate: 0.07, disagreements: 2, overrides: 1, keywordFallbacks: 0, aiJudgment: 3, duplicates: 4, chatIntake: 2, chatUndone: 1 },
    });
    expect(d.length).toBeLessThanOrEqual(4000);
    expect(d).toContain("Nobody owns this list");
  });
});
