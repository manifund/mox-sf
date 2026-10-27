/**
 * Deterministic fallback (§4.6). Sets kind + category only — never a priority.
 * Evaluated in listed order, first match wins: safety first, door_codes before security.
 */
import type { Category, Kind } from "../config.js";

export const KEYWORDS: [Category, string[]][] = [
  ["safety", ["injury", "injured", "bleeding", "fire", "smoke", "gas", "spark", "sparking", "exposed wire", "shock",
    "flood", "flooding", "leak", "leaking", "pouring", "blocked exit", "intruder", "break-in", "broken glass"]],
  ["door_codes", ["door code", "access code", "keypad code", "key code", "code not working", "code doesn't work",
    "code isn't working", "code isnt working", "fob", "badge code", "entry code", "pin"]],
  ["plumbing", ["toilet", "flush", "flushing", "sink", "drain", "clog", "clogged", "backed up", "urinal", "faucet", "tap", "pipe", "overflow"]],
  ["utilities", ["wifi", "wi-fi", "internet", "network", "ethernet", "router", "offline", "power", "outage", "electricity",
    "breaker", "no hot water", "heat", "heating", "ac", "a/c", "hvac", "air conditioning", "too hot", "too cold", "freezing", "stuffy"]],
  ["furniture", ["desk", "chair", "table", "monitor arm", "shelf", "shelving", "drawer", "cabinet", "whiteboard", "stool", "couch", "lamp", "blinds"]],
  ["appliance", ["coffee", "espresso", "kettle", "printer", "print", "scanner", "fridge", "freezer", "microwave",
    "dishwasher", "monitor", "projector", "tv", "screen", "speaker", "hdmi", "dongle", "vending"]],
  ["security", ["lock", "locked", "unlock", "latch", "door won't", "door wont", "camera", "alarm", "buzzer", "intercom", "gate", "elevator"]],
  ["stocking", ["restock", "stock", "out of", "ran out", "empty", "refill", "low on", "need more", "mugs", "cups", "utensils",
    "cutlery", "paper towel", "paper towels", "soap", "toilet paper", "tp", "tissues", "markers", "snacks",
    "protein bar", "coffee beans", "milk", "sanitizer", "trash bags", "cable", "cables", "charger", "adapter"]],
  ["cleaning", ["dirty", "filthy", "gross", "mess", "messy", "trash", "garbage", "bin", "spill", "spilled", "stain", "crumbs",
    "smell", "smells", "stinks", "sticky", "dusty", "not cleaned", "needs cleaning", "vacuum", "mop"]],
  ["cosmetic", ["ugly", "scuff", "scuffed", "paint", "peeling", "crooked", "poster", "disorganized", "cluttered", "clutter", "untidy", "eyesore"]],
];

export const IDEA_PATTERNS = [
  /^(can|could) we\b/i,
  /^we should\b/i,
  /^any chance\b/i,
  /^it would be (nice|good|great)\b/i,
  /^(idea|suggestion):/i,
  /would be nice/i,
  /wish (we|there)\b/i,
];

export const QUESTION_PATTERNS = [
  /^(is|are|do|does|can i|could i|am i|what|when|where|how|who)\b.*\?$/i,
  /^what's the policy/i,
  /^are we allowed/i,
];

export interface KeywordResult {
  kind: Kind;
  category: Category;
  matched: string | null;
}

function containsWord(text: string, phrase: string): boolean {
  // whole-word match so "ac" doesn't hit "back", "tp" doesn't hit "http", "pin" doesn't hit "pinned"
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${esc}(?=$|[^a-z0-9])`, "i").test(text);
}

export function keywordTriage(what: string, context?: string | null): KeywordResult {
  const first = what.trim();
  const text = `${what} ${context ?? ""}`.toLowerCase();

  let category: Category = "other";
  let matched: string | null = null;
  outer: for (const [cat, words] of KEYWORDS) {
    for (const w of words) {
      if (containsWord(text, w)) {
        category = cat;
        matched = w;
        break outer;
      }
    }
  }

  let kind: Kind = "issue";
  // a described breakage is never a question or idea, even if phrased as one
  if (category === "safety") kind = "issue";
  else if (IDEA_PATTERNS.some((re) => re.test(first))) kind = "idea";
  else if (QUESTION_PATTERNS.some((re) => re.test(first)) && category === "other") kind = "question";

  return { kind, category, matched };
}
