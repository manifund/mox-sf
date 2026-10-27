import { describe, expect, it } from "vitest";
import { intakeDecision, isCautious, tagMeansReferencedMessage, worthClassifying } from "../src/chatIntake.js";
import { cfg } from "./helpers.js";

const ask = cfg.chat_intake.channel_ids[0]!;
const msg = (over: Partial<Parameters<typeof worthClassifying>[1]> = {}) => ({ content: "out of oat milk in the 4F kitchen", channelId: ask, authorIsBot: false, inThread: false, ...over });
const g = (kind: "issue" | "idea" | "none", category: string | null, confidence: number) =>
  ({ kind, is_report: kind === "issue", category: category as never, location: null, confidence, reason: "" });

describe("chat intake gate", () => {
  it("only classifies human, top-level, long-enough messages in the configured channel", () => {
    expect(worthClassifying(cfg, msg())).toBe(true);
    expect(worthClassifying(cfg, msg({ channelId: cfg.channels.report_an_issue }))).toBe(false);
    expect(worthClassifying(cfg, msg({ authorIsBot: true }))).toBe(false);
    expect(worthClassifying(cfg, msg({ inThread: true }))).toBe(false);
    expect(worthClassifying(cfg, msg({ content: "thanks!" }))).toBe(false);
    expect(worthClassifying(cfg, msg({ content: "/log what:fixed the printer" }))).toBe(false);
    expect(worthClassifying(cfg, msg({ content: "Do we have power strips / extension", isSystem: true }))).toBe(false); // "X started a thread"
  });

  it("issue: confident and in a physical category; idea: confident wish; otherwise silence", () => {
    expect(intakeDecision(cfg, g("issue", "stocking", 0.92))).toBe("issue");
    expect(intakeDecision(cfg, g("issue", "stocking", 0.6))).toBeNull(); // below the floor
    expect(intakeDecision(cfg, g("issue", "operations", 0.99))).toBeNull(); // not a physical category
    expect(intakeDecision(cfg, g("issue", "other", 0.99))).toBeNull();
    expect(intakeDecision(cfg, g("issue", null, 0.99))).toBeNull();
    expect(intakeDecision(cfg, g("idea", "space", 0.95))).toBe("idea"); // the bike racks
    expect(intakeDecision(cfg, g("idea", null, 0.95))).toBe("idea"); // category not needed for an idea
    expect(intakeDecision(cfg, g("idea", "furniture", 0.7))).toBeNull();
    expect(intakeDecision(cfg, g("none", "stocking", 0.99))).toBeNull();
    expect(intakeDecision(cfg, null)).toBeNull(); // model failure = silence
  });

  it("stocking and ideas need the higher bar and wait for staff; building problems don't", () => {
    const bar = cfg.chat_intake.cautious.min_confidence;
    expect(bar).toBeGreaterThan(cfg.chat_intake.min_confidence);
    expect(intakeDecision(cfg, g("issue", "stocking", bar - 0.02))).toBeNull(); // would pass for plumbing
    expect(intakeDecision(cfg, g("issue", "plumbing", bar - 0.02))).toBe("issue");
    expect(intakeDecision(cfg, g("idea", "stocking", bar - 0.02))).toBeNull();
    expect(intakeDecision(cfg, g("issue", "stocking", bar + 0.02))).toBe("issue");
    expect(isCautious(cfg, "issue", g("issue", "stocking", 0.99))).toBe(true);
    expect(isCautious(cfg, "idea", g("idea", "space", 0.99))).toBe(true);
    expect(isCautious(cfg, "issue", g("issue", "plumbing", 0.99))).toBe(false);
    expect(isCautious(cfg, "issue", g("issue", "safety", 0.99))).toBe(false);
  });

  it("a member's tag opens a ticket unless the gate is sure it isn't a request", () => {
    const sure = cfg.chat_intake.tag_decline_confidence;
    expect(intakeDecision(cfg, g("none", null, sure + 0.05), { tagged: true })).toBeNull(); // "@support-bot thanks!"
    expect(intakeDecision(cfg, g("none", null, sure - 0.1), { tagged: true })).toBe("issue"); // unsure: capture
    expect(intakeDecision(cfg, g("idea", "space", 0.5), { tagged: true })).toBe("idea");
    expect(intakeDecision(cfg, g("issue", "plumbing", 0.4), { tagged: true })).toBe("issue");
    expect(intakeDecision(cfg, null, { tagged: true })).toBe("issue"); // model down: still capture
  });

  it("a reply with a bare tag means the replied-to message; with real words, the tagger's own", () => {
    expect(tagMeansReferencedMessage(cfg, "")).toBe(true);
    expect(tagMeansReferencedMessage(cfg, "this")).toBe(true);
    expect(tagMeansReferencedMessage(cfg, "^^ can you log it?")).toBe(false);
    expect(tagMeansReferencedMessage(cfg, "I think we need a new sign on that fridge because it's definitely unclear now. ( can I just tag you here?)")).toBe(false);
  });

  it("#members-general is tag-only: never picked up automatically", () => {
    expect(cfg.chat_intake.channel_ids).not.toContain("1342558808639275008");
    expect(worthClassifying(cfg, msg({ channelId: "1342558808639275008" }))).toBe(false);
  });

  it("a deliberate tag always opens something; the gate only picks idea vs issue", () => {
    expect(intakeDecision(cfg, g("none", null, 0.99), { force: true })).toBe("issue"); // "do we have power strips?"
    expect(intakeDecision(cfg, g("issue", "stocking", 0.4), { force: true })).toBe("issue");
    expect(intakeDecision(cfg, g("idea", "space", 0.5), { force: true })).toBe("idea");
    expect(intakeDecision(cfg, null, { force: true })).toBe("issue"); // model down: still capture
  });
});
