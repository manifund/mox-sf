import { describe, expect, it } from "vitest";
import { Db, type Status } from "../src/db.js";
import { TRANSITIONS, assertTransition, canTransition, transition } from "../src/core/lifecycle.js";

const ALL: Status[] = ["new", "routed", "claimed", "done", "won't_do", "duplicate", "not_a_ticket", "logged"];

const full = (status: Status) => ({ status, kind: "issue" as const, category: "plumbing" as const, priority: "P1" as const, owner_key: "jake" as const });

describe("lifecycle — §5.1", () => {
  it("a logged idea can be picked up, declined/undone, or marked done", () => {
    expect(TRANSITIONS.logged).toEqual(["routed", "not_a_ticket", "done"]);
  });

  it("every listed transition is allowed", () => {
    for (const [from, tos] of Object.entries(TRANSITIONS) as [Status, Status[]][]) {
      for (const to of tos) expect(() => assertTransition(full(from), to)).not.toThrow();
    }
  });

  it("every other pair is rejected", () => {
    for (const from of ALL) {
      for (const to of ALL) {
        if (TRANSITIONS[from].includes(to)) continue;
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(false);
        expect(() => assertTransition(full(from), to)).toThrow();
      }
    }
  });

  it("routed is refused while kind, category, priority or owner_key is null", () => {
    for (const missing of ["kind", "category", "priority", "owner_key"] as const) {
      const t = { ...full("new"), [missing]: null };
      expect(() => assertTransition(t, "routed")).toThrow(new RegExp(missing));
    }
  });

  it("transition() stamps timestamps and increments reopen_count on done -> routed", () => {
    const db = new Db(":memory:", 100);
    let t = db.insertTicket({
      reporter_id: "1",
      reporter_name: "jen",
      source: "discord",
      contact_kind: "discord",
      contact_value: "1",
      description: "toilet on 4 won't flush",
      location: "4F",
      context: null,
      visibility: "private",
      visibility_source: null,
      status: "new",
    });
    expect(t.id).toBe(100); // numbering starts at MOX-100
    t = db.updateTicket(t.id, { kind: "issue", category: "plumbing", priority: "P1" });
    expect(() => transition(db, t, "routed")).toThrow(/owner_key/);
    t = transition(db, t, "routed", { owner_key: "jake" });
    expect(t.routed_at).toBeTruthy();
    t = transition(db, t, "claimed", { claimed_by: "Jake" });
    expect(t.claimed_at).toBeTruthy();
    t = transition(db, t, "done", { closed_by: "Jake" });
    expect(t.closed_at).toBeTruthy();
    t = transition(db, t, "routed");
    expect(t.reopen_count).toBe(1);
    expect(t.closed_at).toBeNull();
    expect(t.claimed_by).toBeNull();
    db.close();
  });
});
