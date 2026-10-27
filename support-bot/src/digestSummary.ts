/**
 * Short titles for digests only. Tickets keep the reporter's words; a digest is for skimming, so it gets a
 * compressed title, with a guard: a title that introduces a number, floor or place the reporter never wrote
 * is rejected and that line falls back to their own words.
 */
import fs from "node:fs";
import path from "node:path";
import type { App } from "./app.js";
import type { Ticket } from "./db.js";

const cache = new Map<string, string>();
function prompt(file: "digest-summary" | "digest-verify"): string {
  if (!cache.has(file)) cache.set(file, fs.readFileSync(path.resolve(`prompts/${file}.md`), "utf8"));
  return cache.get(file)!;
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'");
const FLOORS = /\b(\d+(?:st|nd|rd|th)?\s*(?:f|fl|floor)\b|(?:first|second|third|fourth|fifth|ground|top)\s+floor|floor\s+\d+)/gi;

/** whole-word presence, so "ac" is not found inside "space" */
const hasWord = (src: string, w: string) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9])`, "i").test(src);

/** Pure: does `summary` stay inside what the reporter actually wrote? */
export function isFaithful(summary: string, source: string): boolean {
  const s = norm(summary);
  const src = norm(source);
  // every number in the summary must appear in the source
  for (const n of s.match(/\d+/g) ?? []) if (!new RegExp(`(^|\\D)${n}(?=$|\\D)`).test(src)) return false;
  // a floor reference must be backed by the source (catches "2nd floor" from "my office")
  for (const f of s.match(FLOORS) ?? []) {
    const digit = f.match(/\d+/)?.[0];
    const word = f.match(/first|second|third|fourth|fifth|ground|top/i)?.[0];
    if (digit && !src.includes(digit)) return false;
    if (word && !src.includes(word.toLowerCase())) return false;
    if (!digit && !word && !/floor/.test(src)) return false;
  }
  // acronyms the reporter never wrote ("AC issue" from "it's hot")
  for (const ac of summary.match(/\b[A-Z]{2,}\b/g) ?? []) if (!hasWord(src, ac.toLowerCase())) return false;
  // capitalised names (places, people) the reporter never wrote
  for (const name of summary.match(/(?<!^)\b[A-Z][a-z]{2,}\b/g) ?? []) if (!hasWord(src, name.toLowerCase())) return false;
  return summary.trim().length > 0 && summary.length <= 80;
}

/** Fill digest_summary for any of these tickets that lack one. Never throws; misses fall back to t.title. */
export async function ensureDigestSummaries(app: App, tickets: Ticket[]): Promise<void> {
  const todo = tickets.filter((t) => !t.digest_summary);
  if (!todo.length || !app.ai) return;
  const user = todo.map((t) => `${t.id}: ${t.description.replace(/\s+/g, " ").slice(0, 600)}${t.location && t.location !== "Not stated" ? ` (location given: ${t.location})` : ""}`).join("\n");
  const out = await app.ai.complete(prompt("digest-summary"), user, 1200);
  if (!out) {
    app.log.warn({ requested: todo.length }, "digest titles: model returned nothing; using reporters' words");
    return;
  }
  let saved = 0;
  let rejected = 0;
  const candidates: { t: Ticket; title: string }[] = [];
  for (const line of out.split("\n")) {
    const m = /^\s*(?:MOX-)?(\d+)\s*[:.)-]\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const t = todo.find((x) => x.id === Number(m[1]));
    if (!t) continue;
    const title = m[2]!.replace(/—/g, ",").replace(/\.$/, "");
    const source = `${t.description} ${t.location}`;
    if (!isFaithful(title, source)) {
      rejected++;
      app.log.warn({ ticket: t.id, title }, "digest title added details the reporter never wrote; using their words");
      continue;
    }
    candidates.push({ t, title });
  }
  // Second, independent pass: does each title keep the reporter's meaning? Anything not clearly "ok" is dropped.
  const verdicts = await verifyTitles(app, candidates);
  for (const { t, title } of candidates) {
    if (verdicts.get(t.id) !== "ok") {
      rejected++;
      app.log.warn({ ticket: t.id, title, verdict: verdicts.get(t.id) ?? "no answer" }, "digest title changed the meaning; using their words");
      continue;
    }
    app.db.updateTicket(t.id, { digest_summary: title });
    t.digest_summary = title;
    saved++;
  }
  app.log.info({ requested: todo.length, saved, rejected }, "digest titles");
}

async function verifyTitles(app: App, items: { t: Ticket; title: string }[]): Promise<Map<number, string>> {
  const verdicts = new Map<number, string>();
  if (!items.length || !app.ai) return verdicts;
  const user = items.map(({ t, title }) => `${t.id}\n  message: ${t.description.replace(/\s+/g, " ").slice(0, 600)}\n  title: ${title}`).join("\n");
  const out = await app.ai.complete(prompt("digest-verify"), user, 600);
  for (const line of (out ?? "").split("\n")) {
    const m = /^\s*(?:MOX-)?(\d+)\s*:\s*(ok|changed)\b/i.exec(line);
    if (m) verdicts.set(Number(m[1]), m[2]!.toLowerCase());
  }
  return verdicts; // empty on failure -> every title falls back to the reporter's words
}
