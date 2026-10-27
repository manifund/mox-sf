/** The decision half of chat intake, kept pure so it can be tested without Discord or the model. */
import type { Config } from "./config.js";
import type { ChatGateOutput } from "./triage/ai.js";

export interface ChatMessageLike {
  content: string;
  channelId: string;
  authorIsBot: boolean;
  inThread: boolean;
  /** Discord system notices ("X started a thread", pins, joins) are never chat */
  isSystem?: boolean;
}

/** Cheap pre-filter: is this message even worth a model call? */
export function worthClassifying(cfg: Config, m: ChatMessageLike): boolean {
  const c = cfg.chat_intake;
  if (!c.enabled) return false;
  if (!c.channel_ids.includes(m.channelId)) return false;
  if (m.authorIsBot || m.inThread || m.isSystem) return false;
  const text = m.content.trim();
  if (text.length < c.min_chars) return false;
  if (text.startsWith("/") || text.startsWith("!")) return false;
  return true;
}

export type IntakeDecision = "issue" | "idea" | null;

/**
 * A reply that tags the bot: is the request the replied-to message, or the tagger's own words?
 * Their own words win when they say something real; the replied-to message is used when the tag
 * stands (nearly) alone, e.g. "@support-bot" or "@support-bot this".
 */
export function tagMeansReferencedMessage(cfg: Config, strippedText: string): boolean {
  const words = strippedText.replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  return words.length < cfg.chat_intake.min_chars;
}

/** Stocking and ideas (configurable) wait for staff and need a higher bar. Building problems don't. */
export function isCautious(cfg: Config, decision: IntakeDecision, g: ChatGateOutput | null): boolean {
  const c = cfg.chat_intake.cautious;
  if (decision === "idea") return c.include_ideas;
  return !!g?.category && c.categories.includes(g.category);
}

/**
 * issue: confident, present-tense, in a physical category -> a ticket with a thread.
 * idea:  confident wish for something new -> the ideas list, no thread, nobody pinged.
 * null:  silence.
 */
export function intakeDecision(cfg: Config, g: ChatGateOutput | null, opts: { force?: boolean; tagged?: boolean } = {}): IntakeDecision {
  // Staff tagged the bot (or ran /mox intake): always open something.
  // The gate only picks idea vs issue; full triage still decides category and owner.
  if (opts.force) return g?.kind === "idea" ? "idea" : "issue";
  // A member tagged the bot: open something unless the gate is sure it isn't a request at all.
  if (opts.tagged) {
    if (g && g.kind === "none" && g.confidence >= cfg.chat_intake.tag_decline_confidence) return null;
    return g?.kind === "idea" ? "idea" : "issue";
  }
  if (!g || g.kind === "none") return null;
  const candidate: IntakeDecision = g.kind === "idea" ? "idea" : "issue";
  if (candidate === "issue" && (!g.category || !cfg.chat_intake.categories.includes(g.category))) return null;
  const floor = isCautious(cfg, candidate, g) ? cfg.chat_intake.cautious.min_confidence : cfg.chat_intake.min_confidence;
  return g.confidence >= floor ? candidate : null;
}

/** @deprecated use intakeDecision */
export function shouldIntake(cfg: Config, g: ChatGateOutput | null): boolean {
  return intakeDecision(cfg, g) === "issue";
}
