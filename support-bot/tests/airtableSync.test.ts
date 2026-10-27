import { describe, expect, it } from "vitest";
import { planRemovals, planSync } from "../src/airtableSync.js";

const owners = ["jake", "carolina", "robin", "claudio", "contractors", "all_staff", "unassigned"];
const open = { status: "routed" as const, kind: "issue" as const, priority: "P1" as const, owner_key: "jake" as const, resolution_note: null, wont_do_reason: null };
const claimed = { ...open, status: "claimed" as const };
const done = { ...open, status: "done" as const };
const idea = { status: "logged" as const, kind: "idea" as const, priority: "P3" as const, owner_key: "unassigned" as const, resolution_note: null, wont_do_reason: null };
// what the bot itself writes for each of those
const rowOf = (over: Record<string, string | null> = {}) => ({ status: "Routed", kind: "Issue", priority: "P1 Important", owner: "Jake", resolution: null, claimedBy: null, ...over });
const ideaRow = (over: Record<string, string | null> = {}) => ({ status: "New", kind: "Idea", priority: "P3 Idea", owner: "Unassigned", resolution: null, claimedBy: null, ...over });

describe("Airtable edits become the same actions as Discord clicks", () => {
  it("a row that matches the bot's record does nothing (no echoes)", () => {
    expect(planSync(open, rowOf(), owners, "Carolina")).toEqual([]);
    expect(planSync(claimed, rowOf({ status: "Claimed" }), owners, "Carolina")).toEqual([]);
    expect(planSync(idea, ideaRow(), owners, "Carolina")).toEqual([]);
  });
  it("status: done, won't do, claim, unclaim, reopen", () => {
    expect(planSync(open, rowOf({ status: "Done" }), owners, "Carolina")).toEqual([{ op: "close" }]);
    expect(planSync(open, rowOf({ status: "Done", resolution: "replaced the bulb" }), owners, "Carolina")).toEqual([{ op: "close" }, { op: "note", text: "replaced the bulb" }]);
    expect(planSync(open, rowOf({ status: "Won't do", resolution: "landlord's job" }), owners, "Carolina")).toEqual([{ op: "wont_do", reason: "landlord's job" }]);
    expect(planSync(open, rowOf({ status: "Won't do" }), owners, "Carolina")).toEqual([{ op: "wont_do", reason: "Closed in Airtable by Carolina" }]);
    expect(planSync(open, rowOf({ status: "Claimed" }), owners, "Carolina")).toEqual([{ op: "claim", name: "Carolina" }]);
    expect(planSync(open, rowOf({ status: "Claimed", claimedBy: "Jake" }), owners, "Carolina")).toEqual([{ op: "claim", name: "Jake" }]);
    expect(planSync(claimed, rowOf({ status: "Routed" }), owners, "Carolina")).toEqual([{ op: "unclaim" }]);
    expect(planSync(done, rowOf({ status: "Routed" }), owners, "Carolina")).toEqual([{ op: "reopen" }]);
  });
  it("owner and priority", () => {
    expect(planSync(open, rowOf({ owner: "Carolina" }), owners, "Jen")).toEqual([{ op: "reassign", owner: "carolina" }]);
    expect(planSync(open, rowOf({ priority: "P0 Urgent" }), owners, "Jen")).toEqual([{ op: "set_priority", priority: "P0" }]);
    expect(planSync(open, rowOf({ priority: "P0 Urgent", owner: "Robin" }), owners, "Jen")).toEqual([{ op: "set_priority", priority: "P0" }, { op: "reassign", owner: "robin" }]);
    expect(planSync(open, rowOf({ priority: "P3 Idea" }), owners, "Jen")).toEqual([{ op: "to_idea" }]);
  });
  it("an owner on an idea keeps it an idea", () => {
    expect(planSync(idea, ideaRow({ owner: "Robin" }), owners, "Jen")).toEqual([{ op: "idea_owner", owner: "robin" }]);
    expect(planSync({ ...idea, owner_key: "robin" }, ideaRow({ owner: "Robin" }), owners, "Jen")).toEqual([]);
    expect(planSync({ ...idea, owner_key: "robin" }, ideaRow({ owner: "Unassigned" }), owners, "Jen")).toEqual([{ op: "idea_owner", owner: "unassigned" }]);
    expect(planSync(idea, ideaRow({ owner: "Whit" }), owners, "Jen")).toEqual([]);
  });

  it("issue <-> idea", () => {
    expect(planSync(open, rowOf({ kind: "Idea" }), owners, "Jen")).toEqual([{ op: "to_idea" }]);
    expect(planSync(idea, ideaRow({ kind: "Issue", priority: "P1 Important", owner: "Carolina" }), owners, "Jen")).toEqual([{ op: "promote", priority: "P1", owner: "carolina" }]);
    expect(planSync(idea, ideaRow({ priority: "P2 No rush" }), owners, "Jen")).toEqual([{ op: "promote", priority: "P2", owner: undefined }]);
    expect(planSync(idea, ideaRow({ priority: "P1 Important", owner: "Robin" }), owners, "Jen")).toEqual([{ op: "promote", priority: "P1", owner: "robin" }]);
    expect(planSync(idea, ideaRow({ status: "Done" }), owners, "Jen")).toEqual([{ op: "close_idea" }]);
    expect(planSync(idea, ideaRow({ status: "Won't do", resolution: "too pricey" }), owners, "Jen")).toEqual([{ op: "decline_idea", reason: "too pricey" }]);
  });
  it("ignores what it can't act on rather than guessing", () => {
    expect(planSync(open, rowOf({ owner: "Whit" }), owners, "Jen")).toEqual([]); // not an owner any more
    expect(planSync(open, rowOf({ owner: "Unassigned" }), owners, "Jen")).toEqual([]);
    expect(planSync(open, rowOf({ status: "Duplicate" }), owners, "Jen")).toEqual([]); // needs a link to the original
  });
});

describe("rows deleted in Airtable", () => {
  const known = [{ id: 100, recordId: "recA" }, { id: 119, recordId: "recB" }, { id: 120, recordId: "recC" }];
  it("tickets whose row is gone are removed", () => {
    expect(planRemovals(known, new Set(["recC"]), 15)).toEqual([100, 119]);
    expect(planRemovals(known, new Set(["recA", "recB", "recC"]), 15)).toEqual([]);
  });
  it("an empty read or a mass disappearance is treated as a broken read, not deletions", () => {
    expect(planRemovals(known, new Set(), 15)).toBeNull();
    expect(planRemovals(known, new Set(["recC"]), 1)).toBeNull();
  });
});
