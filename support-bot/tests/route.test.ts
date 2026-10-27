import { describe, expect, it } from "vitest";
import { deliveryPlan, route, rotaPick, type RouteInput } from "../src/routing.js";
import { cfg, la } from "./helpers.js";

const base = (over: Partial<RouteInput>): RouteInput => ({
  ticketId: 100, // even -> jake
  kind: "issue",
  category: "plumbing",
  priority: "P1",
  now: la("14:00"),
  suggestedOwner: null,
  confidence: 0.95,
  ...over,
});

const ch = cfg.channels;
const uid = (k: keyof typeof cfg.owners) => cfg.owners[k]!.mention_user_ids[0]!;

describe("route() — §11.1 deterministic table", () => {
  it("safety / P0 / 03:00 -> all_staff, #team-jake + @mox staff", () => {
    const r = route(cfg, base({ category: "safety", priority: "P0", now: la("03:00") }));
    expect(r.ownerKey).toBe("all_staff");
    expect(r.rule).toBe("R2");
    const d = deliveryPlan(cfg, r.ownerKey, "P0");
    expect(d.channelId).toBe(ch.team_jake);
    expect(d.mentionRoleId).toBe(cfg.roles.mox_staff);
  });

  it("safety at any priority still routes to all_staff", () => {
    expect(route(cfg, base({ category: "safety", priority: "P2" })).ownerKey).toBe("all_staff");
  });

  it("door_codes / P1 -> carolina, thread only", () => {
    const r = route(cfg, base({ category: "door_codes" }));
    expect(r.ownerKey).toBe("carolina");
    const d = deliveryPlan(cfg, r.ownerKey, "P1");
    expect(d.channelId).toBeNull();
    expect(d.mentionUserIds).toEqual([uid("carolina")]);
    expect(d.channelBased).toBe(false);
  });

  it("door_codes / P0 -> carolina, thread AND #team-carolina", () => {
    const r = route(cfg, base({ category: "door_codes", priority: "P0" }));
    expect(r.ownerKey).toBe("carolina");
    expect(deliveryPlan(cfg, r.ownerKey, "P0").channelId).toBe(ch.team_carolina);
  });

  it("security / P1 -> facilities rota, thread only, only that person mentioned", () => {
    const r = route(cfg, base({ category: "security", ticketId: 100 }));
    expect(r.ownerKey).toBe("jake");
    expect(r.rule).toBe("R6");
    const d = deliveryPlan(cfg, r.ownerKey, "P1");
    expect(d.channelId).toBeNull();
    expect(d.mentionUserIds).toEqual([uid("jake")]);
  });

  it("with one name in the rota every facilities ticket goes to that person (Whit left)", () => {
    expect(cfg.rota.facilities).toEqual(["jake"]);
    expect(rotaPick(cfg, 42)).toBe("jake");
    expect(rotaPick(cfg, 39)).toBe("jake");
    expect(route(cfg, base({ ticketId: 101 })).ownerKey).toBe("jake");
  });

  it("with two names the rota splits by parity: even -> first, odd -> second, forever", () => {
    const two = { ...cfg, rota: { ...cfg.rota, facilities: ["jake", "whit"] as ("jake" | "whit")[] }, owners: { ...cfg.owners, whit: { ...cfg.owners.jake!, display_name: "Whit", mention_user_ids: ["447179794132631562"] } } };
    expect(rotaPick(two, 42)).toBe("jake");
    expect(rotaPick(two, 39)).toBe("whit");
    expect(route(two, base({ ticketId: 101 })).ownerKey).toBe("whit");
    expect(new Set(deliveryPlan(two, "whit", "P0").mentionUserIds)).toEqual(new Set([uid("jake"), "447179794132631562"]));
  });

  it("plumbing / P0 -> facilities, thread AND #team-jake", () => {
    const r = route(cfg, base({ priority: "P0", ticketId: 101 }));
    expect(r.ownerKey).toBe("jake");
    const d = deliveryPlan(cfg, r.ownerKey, "P0");
    expect(d.channelId).toBe(ch.team_jake);
    expect(d.mentionUserIds).toEqual([uid("jake")]);
  });

  it("utilities / P1 / 20:00 -> facilities, thread only (hours don't apply)", () => {
    const r = route(cfg, base({ category: "utilities", now: la("20:00") }));
    expect(r.ownerKey).toBe("jake");
    expect(deliveryPlan(cfg, r.ownerKey, "P1").channelId).toBeNull();
  });

  it("appliance / P1 and furniture / P2 -> facilities, thread only", () => {
    for (const category of ["appliance", "furniture"] as const) {
      const r = route(cfg, base({ category, priority: category === "furniture" ? "P2" : "P1" }));
      expect(r.ownerKey).toBe("jake");
      expect(deliveryPlan(cfg, r.ownerKey, "P2").channelId).toBeNull();
    }
  });

  it("stocking / P2 / 09:00 and 02:00 -> claudio, #team-claudio", () => {
    for (const t of ["09:00", "02:00"]) {
      const r = route(cfg, base({ category: "stocking", priority: "P2", now: la(t) }));
      expect(r.ownerKey).toBe("claudio");
      expect(r.rule).toBe("R4");
      const d = deliveryPlan(cfg, "claudio", "P2");
      expect(d.channelId).toBe(ch.team_claudio);
      expect(d.channelBased).toBe(true);
    }
  });

  it("cleaning boundaries are exact: 16:59 claudio · 17:00 contractors · 23:59 contractors · 00:00 claudio", () => {
    const at = (t: string) => route(cfg, base({ category: "cleaning", priority: "P2", now: la(t) })).ownerKey;
    expect(at("16:59")).toBe("claudio");
    expect(at("17:00")).toBe("contractors");
    expect(at("23:59")).toBe("contractors");
    expect(at("00:00")).toBe("claudio");
    expect(deliveryPlan(cfg, "contractors", "P2").channelId).toBe(ch.mox_contractor_requests);
  });

  it("cleaning / P0 / 23:00 -> facilities, never contractors", () => {
    const r = route(cfg, base({ category: "cleaning", priority: "P0", now: la("23:00"), ticketId: 100 }));
    expect(r.ownerKey).toBe("jake");
    expect(r.rule).toBe("R5");
    expect(deliveryPlan(cfg, r.ownerKey, "P0").channelId).toBe(ch.team_jake);
  });

  it("cosmetic / P2 / 14:00 -> claudio", () => {
    expect(route(cfg, base({ category: "cosmetic", priority: "P2" })).ownerKey).toBe("claudio");
  });

  it("events -> claudio regardless of hour; operations -> robin; space -> carolina", () => {
    expect(route(cfg, base({ category: "events", now: la("22:00") })).ownerKey).toBe("claudio");
    expect(route(cfg, base({ category: "operations" })).ownerKey).toBe("robin");
    expect(route(cfg, base({ category: "space" })).ownerKey).toBe("carolina");
  });

  it("idea -> unassigned, nothing delivered", () => {
    const r = route(cfg, base({ kind: "idea", category: "stocking", priority: "P3" }));
    expect(r.ownerKey).toBe("unassigned");
    expect(r.rule).toBe("R1");
    const d = deliveryPlan(cfg, "unassigned", "P3");
    expect(d.channelId).toBeNull();
    expect(d.mentionUserIds).toEqual([]);
  });
});

describe("route() — judgment tier (R3)", () => {
  it("category other uses the model's suggested owner and records ai_judgment", () => {
    const r = route(cfg, base({ category: "other", suggestedOwner: "carolina", confidence: 0.9 }));
    expect(r).toMatchObject({ ownerKey: "carolina", routedBy: "ai_judgment", rule: "R3" });
  });

  it("low confidence overrides a mapped category", () => {
    const r = route(cfg, base({ category: "plumbing", suggestedOwner: "carolina", confidence: 0.4 }));
    expect(r).toMatchObject({ ownerKey: "carolina", routedBy: "ai_judgment" });
  });

  it("suggested facilities resolves through the rota", () => {
    expect(route(cfg, base({ category: "other", suggestedOwner: "facilities", ticketId: 100 })).ownerKey).toBe("jake");
    expect(route(cfg, base({ category: "other", suggestedOwner: "facilities", ticketId: 101 })).ownerKey).toBe("jake");
  });

  it("suggested contractors is coerced to claudio and re-resolved by the clock", () => {
    expect(route(cfg, base({ category: "other", suggestedOwner: "contractors" })).ownerKey).toBe("claudio");
    expect(route(cfg, base({ category: "cleaning", confidence: 0.3, suggestedOwner: "contractors", now: la("20:00"), priority: "P2" })).ownerKey).toBe("contractors");
    expect(route(cfg, base({ category: "cleaning", confidence: 0.3, suggestedOwner: "contractors", now: la("20:00"), priority: "P0" })).ownerKey).toBe("jake");
  });

  it("keyword path (no suggestion) resolves to carolina", () => {
    const r = route(cfg, base({ category: "other", suggestedOwner: null, confidence: null }));
    expect(r.ownerKey).toBe("carolina");
  });

  it("an unknown owner name never lands anywhere but the default", () => {
    expect(route(cfg, base({ category: "other", suggestedOwner: "batman" })).ownerKey).toBe("carolina");
  });
});
