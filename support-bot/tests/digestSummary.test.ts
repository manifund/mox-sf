import { describe, expect, it } from "vitest";
import { isFaithful } from "../src/digestSummary.js";

describe("digest titles never add what the reporter didn't write", () => {
  it("accepts a compression of their words", () => {
    expect(isFaithful("Office too cold", "my office is too freaking cold!!!")).toBe(true);
    expect(isFaithful("Water filter off in 3f kitchen", "Can we get the water filter on 3f kitchen turned on again?")).toBe(true);
    expect(isFaithful("Wifi bad in phone booths", "wireless internet bad in phone booths")).toBe(true);
  });
  it("rejects invented floors, numbers and names", () => {
    expect(isFaithful("2nd floor office too cold", "my office is too freaking cold!!!")).toBe(false);
    expect(isFaithful("Phone booth wifi on 3F and 4F", "wireless internet bad in phone booths")).toBe(false);
    expect(isFaithful("Visitor from Zarpulon 8", "i am an alien and i demand to talk to the most intelligent human at mox")).toBe(false);
    expect(isFaithful("Aqua regia damage on Mission St wall", "building being attacked by kaiju spewing aqua regia")).toBe(false);
    expect(isFaithful("3f too hot, AC issue", "is hot on 3f.")).toBe(false);
    expect(isFaithful("FPGA device driver needed", "need someone to write an fpga device driver")).toBe(true);
    expect(isFaithful("3f is too hot, AC may be broken", "is hot on 3f. Is AC not on / broken?")).toBe(true); // they said AC
    expect(isFaithful("Lounge AC broken", "there's no space in the lounge")).toBe(false); // "ac" inside "space" doesn't count
    expect(isFaithful("Needs 10 chairs", "needs 100 chairs")).toBe(false); // 10 is not 100
  });
  it("keeps numbers the reporter did write", () => {
    expect(isFaithful("Needs 10 sodium halide fixtures", "i need 10 sodium halide fixtures in my office immediately")).toBe(true);
  });
});
