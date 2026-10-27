/**
 * Tickets keep the reporter's own words. The model decides category, owner and priority; it never
 * rewrites what someone said. These helpers only trim, they never paraphrase.
 */

/** Collapse whitespace and tidy what removing an @support-bot tag leaves behind ("( can I" -> "(can I"). */
export function tidyWords(text: string): string {
  return text
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\(\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The reporter's first sentence, or their opening words cut at a word boundary. */
export function titleFromWords(text: string, max = 80): string {
  const one = tidyWords(text).replace(/\s+/g, " ");
  const firstSentence = /^(.+?[.!?])(\s|$)/.exec(one)?.[1] ?? one;
  if (firstSentence.length <= max) return firstSentence;
  const cut = firstSentence.slice(0, max - 3);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).replace(/[,;:]$/, "")}...`;
}

/** The reporter's message verbatim, capped only so it fits a Discord card. */
export function summaryFromWords(text: string, max = 1500): string {
  const t = tidyWords(text);
  return t.length <= max ? t : `${t.slice(0, max - 3)}...`;
}

/** Several messages from one reporter, verbatim, as one description. A part with no closing punctuation gets a period. */
export function joinReporterParts(parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i, a) => (i < a.length - 1 && !/[.!?:)]$/.test(p) ? `${p}.` : p))
    .join("\n\n");
}
