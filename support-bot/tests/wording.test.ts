import { describe, expect, it } from "vitest";
import { joinReporterParts, summaryFromWords, tidyWords, titleFromWords } from "../src/triage/wording.js";

describe("tickets keep the reporter's own words", () => {
  it("title is the first sentence, verbatim", () => {
    expect(titleFromWords("The coffee machine on 4 won't turn on. Tried the switch.")).toBe("The coffee machine on 4 won't turn on.");
    expect(titleFromWords("toilet on 2 is clogged again")).toBe("toilet on 2 is clogged again");
  });
  it("a long first sentence is cut at a word, never rewritten", () => {
    const t = titleFromWords("In the past the small fridge was where shared food was so someone may have thought they were intended to be shared.");
    expect(t.endsWith("...")).toBe(true);
    expect(t.length).toBeLessThanOrEqual(80);
    expect("In the past the small fridge was where shared food was so someone may have thought").toContain(t.slice(0, -3));
  });
  it("summary is the whole message, verbatim", () => {
    const msg = "There seems to be an under supply of USB-C laptop chargers. Ideally every workstation would have one.";
    expect(summaryFromWords(msg)).toBe(msg);
  });
  it("a thread's title line and the reporter's follow-up become one verbatim description", () => {
    const d = joinReporterParts(["Led lights in 4th floor kitchen", "Not urgent, but the LED strip is flickering so I've unplugged it.", ""]);
    expect(d).toBe("Led lights in 4th floor kitchen.\n\nNot urgent, but the LED strip is flickering so I've unplugged it.");
    expect(titleFromWords(d)).toBe("Led lights in 4th floor kitchen.");
  });

  it("tidies only what removing a tag leaves behind", () => {
    expect(tidyWords("we need a new sign. ( can I just tag you here?)")).toBe("we need a new sign. (can I just tag you here?)");
    expect(tidyWords("fix this  ()")).toBe("fix this");
  });
});
