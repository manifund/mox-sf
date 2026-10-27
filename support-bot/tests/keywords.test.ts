import { describe, expect, it } from "vitest";
import { keywordTriage } from "../src/triage/keywords.js";

describe("keyword fallback — §4.6", () => {
  it.each([
    ["toilet on 4 won't flush", "issue", "plumbing"],
    ["wifi is down, nobody on 3 can work", "issue", "utilities"],
    ["water pouring through the ceiling", "issue", "safety"],
    ["coffee machine won't turn on", "issue", "appliance"],
    ["out of mugs and paper towels", "issue", "stocking"],
    ["bathrooms are dirty", "issue", "cleaning"],
    ["my door code isn't working for 302", "issue", "door_codes"],
    ["the lock on 302 is broken", "issue", "security"],
    ["my monitor arm is broken", "issue", "furniture"],
    ["ugly scuff on the stairwell wall", "issue", "cosmetic"],
    ["can we stock vegan protein bars?", "idea", "stocking"],
    ["we should get CO2 monitors", "idea", "other"],
    ["would be nice to have a standing desk", "idea", "furniture"],
    ["do you do parties here?", "question", "other"],
    ["can I bring my plant from home?", "question", "other"],
  ] as const)("%s -> %s / %s", (text, kind, category) => {
    const r = keywordTriage(text);
    expect(r.kind).toBe(kind);
    expect(r.category).toBe(category);
  });

  it("safety wins over everything and is never a question", () => {
    expect(keywordTriage("is there a gas leak? smells like gas in the kitchen")).toMatchObject({ kind: "issue", category: "safety" });
  });

  it("door_codes beats security when both match", () => {
    expect(keywordTriage("the door code on the locked side door doesn't work").category).toBe("door_codes");
  });

  it("whole-word matching: 'back' is not 'ac', 'pinned' is not 'pin'", () => {
    expect(keywordTriage("the pinned poster in the back hallway fell down").category).toBe("cosmetic");
  });
});
