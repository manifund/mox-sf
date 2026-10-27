import { describe, expect, it } from "vitest";
import { planCommand } from "../src/ticketCommands.js";

const owners = ["jake", "carolina", "robin", "claudio", "contractors", "all_staff", "unassigned"];
const idea = { status: "logged" as const, kind: "idea" as const, priority: "P3" as const, owner_key: "unassigned" as const };
const open = { status: "routed" as const, kind: "issue" as const, priority: "P2" as const, owner_key: "jake" as const };
const done = { status: "done" as const, kind: "issue" as const, priority: "P1" as const, owner_key: "jake" as const };
const cmd = (action: string, extra: Record<string, unknown> = {}) => ({ action, priority: null, owner: null, reason: null, ...extra }) as never;

describe("staff instructions about a ticket", () => {
  it("reprioritizing an idea turns it into a work item at that priority", () => {
    expect(planCommand(owners, idea, cmd("set_priority", { priority: "P1" }))).toEqual({ op: "promote", priority: "P1", owner: undefined });
    expect(planCommand(owners, idea, cmd("reassign", { owner: "carolina" }))).toEqual({ op: "promote", priority: "P2", owner: "carolina" });
    expect(planCommand(owners, idea, cmd("make_work_item"))).toEqual({ op: "promote", priority: "P2", owner: undefined });
  });
  it("on open work it changes priority or owner", () => {
    expect(planCommand(owners, open, cmd("set_priority", { priority: "P0" }))).toEqual({ op: "set_priority", priority: "P0", owner: undefined });
    expect(planCommand(owners, open, cmd("reassign", { owner: "robin", priority: "P1" }))).toEqual({ op: "reassign", owner: "robin", priority: "P1" });
    expect(planCommand(owners, open, cmd("close"))).toEqual({ op: "close" });
    expect(planCommand(owners, open, cmd("wont_do", { reason: "out of scope" }))).toEqual({ op: "wont_do", reason: "out of scope" });
  });
  it("open work can be moved to the ideas list", () => {
    expect(planCommand(owners, open, cmd("make_idea"))).toEqual({ op: "to_idea" });
    expect(planCommand(owners, idea, cmd("make_idea")).op).toBe("refuse");
  });

  it("ideas can be marked done or declined with a reason", () => {
    expect(planCommand(owners, idea, cmd("close"))).toEqual({ op: "close_idea" });
    expect(planCommand(owners, idea, cmd("wont_do", { reason: "too expensive for now" }))).toEqual({ op: "decline_idea", reason: "too expensive for now" });
  });

  it("an owner nobody named is ignored and routing decides", () => {
    const namedOnly = (said: string) => (key: string) => said.includes(key);
    expect(planCommand(owners, idea, cmd("make_work_item", { owner: "jake" }), namedOnly("let's actually do this one"))).toEqual({ op: "promote", priority: "P2", owner: undefined });
    expect(planCommand(owners, idea, cmd("reassign", { owner: "carolina" }), namedOnly("give it to carolina"))).toEqual({ op: "promote", priority: "P2", owner: "carolina" });
  });

  it("refuses rather than guessing", () => {
    expect(planCommand(owners, open, cmd("wont_do")).op).toBe("refuse"); // no reason
    expect(planCommand(owners, open, cmd("reassign", { owner: "whit" })).op).toBe("refuse"); // not an owner any more
    expect(planCommand(owners, open, cmd("set_priority")).op).toBe("refuse"); // which priority?
    expect(planCommand(owners, done, cmd("set_priority", { priority: "P0" })).op).toBe("refuse"); // closed
  });
  it("anything unclear is answered as a question", () => {
    expect(planCommand(owners, open, cmd("answer"))).toEqual({ op: "answer" });
    expect(planCommand(owners, open, null)).toEqual({ op: "answer" });
  });
});
