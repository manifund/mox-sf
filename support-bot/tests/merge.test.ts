import { describe, expect, it } from "vitest";
import { mergePriority, respectReporterUrgency } from "../src/triage/merge.js";

describe("reporter urgency is authoritative", () => {
  it("a ticked urgent box turns a would-be idea into an issue; nothing else changes", () => {
    expect(respectReporterUrgency("idea", true)).toBe("issue");
    expect(respectReporterUrgency("idea", false)).toBe("idea");
    expect(respectReporterUrgency("issue", true)).toBe("issue");
    expect(respectReporterUrgency("question", true)).toBe("question");
  });
  it("and the merge then makes it P0", () => {
    expect(mergePriority({ kind: "issue", category: "space", reported: "P0", reportedSource: "reporter", assessed: "P2" }).priority).toBe("P0");
  });
});

describe("mergePriority — §4.5 escalate only", () => {
  it("reporter P0, AI P0 -> P0 reporter", () => {
    expect(mergePriority({ kind: "issue", category: "plumbing", reported: "P0", reportedSource: "reporter", assessed: "P0" })).toEqual({
      priority: "P0",
      source: "reporter",
      disagreement: false,
    });
  });
  it("reporter P2, AI P0 -> P0 ai_escalation", () => {
    expect(mergePriority({ kind: "issue", category: "plumbing", reported: "P2", reportedSource: "reporter", assessed: "P0" })).toMatchObject({
      priority: "P0",
      source: "ai_escalation",
    });
  });
  it("reporter P0, AI P2 -> P0 reporter with the disagreement flag (never de-escalate)", () => {
    expect(mergePriority({ kind: "issue", category: "cosmetic", reported: "P0", reportedSource: "reporter", assessed: "P2" })).toEqual({
      priority: "P0",
      source: "reporter",
      disagreement: true,
    });
  });
  it("safety with no reported priority -> P0 safety", () => {
    expect(mergePriority({ kind: "issue", category: "safety", reported: null, reportedSource: "reporter", assessed: "P1" })).toMatchObject({
      priority: "P0",
      source: "safety",
    });
  });
  it("any idea -> P3 idea, whatever anyone said", () => {
    expect(mergePriority({ kind: "idea", category: "stocking", reported: "P0", reportedSource: "reporter", assessed: "P0" })).toMatchObject({
      priority: "P3",
      source: "idea",
    });
  });
  it("urgency not ticked: the model's read decides; keyword path defaults to P1", () => {
    expect(mergePriority({ kind: "issue", category: "appliance", reported: null, reportedSource: "reporter", assessed: "P2" })).toMatchObject({
      priority: "P2",
      source: "ai_assessment",
    });
    expect(mergePriority({ kind: "issue", category: "appliance", reported: null, reportedSource: "reporter", assessed: "P0" })).toMatchObject({
      priority: "P0",
      source: "ai_assessment",
    });
    expect(mergePriority({ kind: "issue", category: "appliance", reported: null, reportedSource: "reporter", assessed: null })).toMatchObject({
      priority: "P1",
      source: "default",
    });
  });
  it("keyword path: effective = reported", () => {
    expect(mergePriority({ kind: "issue", category: "appliance", reported: "P2", reportedSource: "reporter", assessed: null })).toMatchObject({
      priority: "P2",
      source: "reporter",
    });
  });
});
