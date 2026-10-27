/** Escalate-only merge (§4.5). Never de-escalates. */
import type { Category, Kind, Priority } from "../config.js";
import type { PrioritySource } from "../db.js";

const RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

/**
 * The reporter has the last word on urgency (C2): if they ticked "This is urgent", the model may not
 * file it as an idea. It becomes an issue and the escalate-only merge makes it P0.
 */
export function respectReporterUrgency<K extends string>(kind: K | "idea" | "issue", urgent: boolean): K | "idea" | "issue" {
  return urgent && kind === "idea" ? "issue" : kind;
}

export function moreUrgent(a: Priority, b: Priority): Priority {
  return RANK[a] <= RANK[b] ? a : b;
}

export interface MergeInput {
  kind: Kind | null;
  category: Category | null;
  /** P0 when the member ticked "urgent"; null when they didn't (no preference between P1 and P2) */
  reported: "P0" | "P1" | "P2" | null;
  reportedSource: "reporter" | "timeout";
  assessed: "P0" | "P1" | "P2" | null;
}

export interface MergeResult {
  priority: Priority;
  source: PrioritySource;
  /** reporter and AI disagreed and the reporter's (more urgent) call won */
  disagreement: boolean;
}

export function mergePriority(m: MergeInput): MergeResult {
  if (m.kind === "idea") return { priority: "P3", source: "idea", disagreement: false };
  if (m.category === "safety") return { priority: "P0", source: "safety", disagreement: false };

  const reported = m.reported;
  const assessed = m.assessed;
  // no urgency ticked: the member expressed no preference, so the model's read decides (P1 on the keyword path)
  if (!reported && !assessed) return { priority: "P1", source: "default", disagreement: false };
  if (!reported) return { priority: assessed!, source: "ai_assessment", disagreement: false };
  if (!assessed) return { priority: reported, source: m.reportedSource, disagreement: false };

  const effective = moreUrgent(reported, assessed);
  if (effective === reported && reported === assessed) return { priority: reported, source: m.reportedSource, disagreement: false };
  if (effective === reported) return { priority: reported, source: m.reportedSource, disagreement: true };
  return { priority: assessed, source: "ai_escalation", disagreement: false };
}
