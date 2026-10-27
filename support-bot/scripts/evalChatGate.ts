/** `npx tsx scripts/evalChatGate.ts` — runs the chat-intake gate over sample messages. Expect every "no" row to stay silent. */
import { loadChatIntakePrompt, loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { intakeDecision } from "../src/chatIntake.js";
import { TriageAI } from "../src/triage/ai.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const ai = new TriageAI(env.ANTHROPIC_API_KEY!, env.TRIAGE_MODEL, "", 10000);
const prompt = loadChatIntakePrompt(cfg);

const rows: [string, "issue" | "idea" | null, boolean][] = [
  // message, expected decision, authorIsStaff
  ["out of oat milk in the 4F kitchen", "issue", false],
  ["toilet on 2 is clogged again", "issue", false],
  ["wifi is down on 3, nobody can work", "issue", false],
  ["the door to 302 won't lock", "issue", false],
  ["someone spilled coffee all over the lounge floor", "issue", false],
  ["we need 30 chairs in the lounge by 6 for the meetup", "issue", false],
  ["printer on 2 is jammed again", "issue", true],
  ["do we have oat milk?", null, false],
  ["is the wifi slow for anyone else?", null, false],
  ["thanks for fixing the toilet!", null, false],
  ["fixed the 4F coffee machine", null, true],
  ["can members bring guests on weekends?", null, false],
  ["what's the guest wifi password?", null, false],
  ["I'm looking at the printer issue now", null, true],
  ["anyone have a usb-c charger I could borrow for an hour?", null, false],
  ["should we start charging for evening events?", null, false],
  ["can we get a standing desk for the quiet room?", "idea", false],
  ["The bike room has been super successful (congrats Mox) to the point that it is now a bit crowded! Would love more bike racks/space so that getting my bike out doesn't require moving 3 others", "idea", false],
  ["a second microwave on 4 would be amazing", "idea", false],
  ["the zapier that posts to slack stopped working", null, false],
  ["lunch is here!", null, true],
  ["heads up the 3F bathroom is out of soap and paper towels", "issue", false],
];
let ok = 0;
for (const [text, expected, staff] of rows) {
  const g = await ai.classifyChat(prompt, text, staff);
  const got = intakeDecision(cfg, g);
  const mark = got === expected ? "✓" : "✗";
  if (got === expected) ok++;
  console.log(`${mark} ${String(got).padEnd(5)} ${(g ? `${g.kind} ${g.category ?? "-"} ${g.confidence.toFixed(2)} loc=${g.location ?? "-"}` : "null").padEnd(42)} "${text.slice(0, 70)}"`);
}
console.log(`\n${ok}/${rows.length} as expected`);
process.exit(ok === rows.length ? 0 : 1);
