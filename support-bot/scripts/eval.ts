/**
 * `npm run eval` — replays tests/golden.jsonl through the live Haiku triage and route().
 * Pass bar (§11.2): 100% on kind, ≥90% on category, nothing unassigned except ideas,
 * suggested_owner never contractors. Re-run after every edit to prompts/triage.md.
 */
import fs from "node:fs";
import { loadConfig, loadDotEnv, loadEnv, loadPrompt } from "../src/config.js";
import { route } from "../src/routing.js";
import { TriageAI } from "../src/triage/ai.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
if (!env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is required for the eval");
  process.exit(1);
}
const ai = new TriageAI(env.ANTHROPIC_API_KEY, env.TRIAGE_MODEL, loadPrompt(cfg), 15000);

type Row = { what: string; where: string; kind: string; category: string | null; owner: string | null };
const rows: Row[] = fs
  .readFileSync("tests/golden.jsonl", "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Row);

const ownerMatches = (expected: string, actual: string) => (expected === "facilities" ? actual === "jake" || actual === "whit" : expected === actual);

let kindOk = 0,
  catOk = 0,
  catTotal = 0,
  ownerOk = 0,
  ownerTotal = 0;
const failures: string[] = [];
// Pin the clock to a weekday afternoon in LA — the golden set expects daytime (Claudio) routing.
const now = new Date("2026-09-22T14:00:00-07:00");
const localTime = "2026-09-22 14:00 (tue) America/Los_Angeles";

for (const [i, r] of rows.entries()) {
  const res = await ai.triage({ what: r.what, where: r.where, localTime, openTickets: [] });
  if (!res) {
    failures.push(`#${i + 1} "${r.what}": no result from the model`);
    continue;
  }
  const o = res.output;
  const okKind = o.kind === r.kind;
  if (okKind) kindOk++;
  let line = `${okKind ? "✓" : "✗"} kind=${o.kind}`;
  if (r.category !== null) {
    catTotal++;
    const okCat = o.category === r.category;
    if (okCat) catOk++;
    line += ` ${okCat ? "✓" : "✗"} category=${o.category}(${o.confidence.toFixed(2)})`;
  }
  if (r.owner !== null && o.kind !== "question") {
    ownerTotal++;
    const rr = route(cfg, {
      ticketId: 100 + i,
      kind: o.kind,
      category: o.category,
      priority: o.kind === "idea" ? "P3" : o.assessed_priority,
      now,
      suggestedOwner: o.suggested_owner,
      confidence: o.confidence,
    });
    const okOwner = ownerMatches(r.owner, rr.ownerKey);
    if (okOwner) ownerOk++;
    line += ` ${okOwner ? "✓" : "✗"} owner=${rr.ownerKey}[${rr.rule}] suggested=${o.suggested_owner}`;
    if (o.kind === "issue" && rr.ownerKey === "unassigned") failures.push(`#${i + 1} landed unassigned`);
  }
  if (o.suggested_owner === "contractors") failures.push(`#${i + 1} suggested_owner=contractors`);
  console.log(`${String(i + 1).padStart(2)} ${line}  — "${r.what}"`);
  if (!okKind || (r.category !== null && o.category !== r.category)) failures.push(`#${i + 1} "${r.what}": expected ${r.kind}/${r.category}, got ${o.kind}/${o.category}`);
}

const kindPct = kindOk / rows.length;
const catPct = catTotal ? catOk / catTotal : 1;
console.log(`\nkind ${kindOk}/${rows.length} (${Math.round(kindPct * 100)}%) · category ${catOk}/${catTotal} (${Math.round(catPct * 100)}%) · owner ${ownerOk}/${ownerTotal}`);
if (failures.length) console.log(`\n${failures.join("\n")}`);
const pass = kindPct === 1 && catPct >= 0.9 && !failures.some((f) => f.includes("unassigned") || f.includes("contractors"));
console.log(pass ? "\nPASS" : "\nFAIL");
process.exit(pass ? 0 : 1);
