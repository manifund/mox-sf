/**
 * Orchestrator: AI first, keyword fallback, always produces a TriageDecision (C8).
 */
import type { Category, Config, Kind } from "../config.js";
import type { Db, Ticket } from "../db.js";
import { log } from "../log.js";
import { ageShort, localParts } from "../util/time.js";
import { TriageAI, type TriageOutput } from "./ai.js";
import { keywordTriage } from "./keywords.js";

export interface TriageDecision {
  method: "ai" | "keywords";
  kind: Kind;
  category: Category;
  title: string;
  summary: string;
  assessed_priority: "P0" | "P1" | "P2" | null;
  suggested_owner: string | null;
  owner_reasoning: string | null;
  confidence: number | null;
  reasoning: string | null;
  duplicate_of: number | null;
  duplicate_confidence: number;
}

export class TriageService {
  /** consecutive keyword fallbacks — drives the ops alert in §9.2 */
  consecutiveFallbacks = 0;

  constructor(
    private readonly cfg: Config,
    private readonly db: Db,
    private readonly ai: TriageAI | null,
  ) {}

  get aiEnabled(): boolean {
    return this.ai !== null;
  }

  private openContext(excludeId: number) {
    const now = new Date();
    return this.db
      .listOpen()
      .filter((t) => t.id !== excludeId && t.title)
      .slice(-40)
      .map((t) => ({
        id: t.id,
        title: t.title ?? "",
        category: t.category ?? "other",
        location: t.location,
        age: ageShort(t.created_at, now),
      }));
  }

  keywords(ticket: Pick<Ticket, "description" | "context" | "location">): TriageDecision {
    const kw = keywordTriage(ticket.description, ticket.context);
    const title = ticket.description.replace(/\s+/g, " ").trim().slice(0, 80);
    return {
      method: "keywords",
      kind: kw.kind,
      category: kw.category,
      title,
      summary: `${title}${ticket.location ? ` — ${ticket.location}` : ""}`.slice(0, 140),
      assessed_priority: null,
      suggested_owner: null,
      owner_reasoning: null,
      confidence: null,
      reasoning: kw.matched ? `keyword: "${kw.matched}"` : "no keyword match",
      duplicate_of: null,
      duplicate_confidence: 0,
    };
  }

  private fromAI(out: TriageOutput): TriageDecision {
    return {
      method: "ai",
      kind: out.kind,
      category: out.category,
      title: out.title.slice(0, 80),
      summary: out.summary.slice(0, 140),
      assessed_priority: out.assessed_priority,
      // the clock decides contractors, never the model (§4.4.2)
      suggested_owner: out.suggested_owner === "contractors" ? "claudio" : out.suggested_owner,
      owner_reasoning: out.owner_reasoning || null,
      confidence: out.confidence,
      reasoning: out.reasoning || null,
      duplicate_of: out.duplicate_of ?? null,
      duplicate_confidence: out.duplicate_confidence ?? 0,
    };
  }

  /** Never throws. Never returns null. */
  async run(ticket: Ticket): Promise<TriageDecision> {
    if (this.ai) {
      const lp = localParts(new Date(), this.cfg.claudio_hours.tz);
      const localTime = `${lp.ymd} ${String(lp.hour).padStart(2, "0")}:${String(lp.minute).padStart(2, "0")} (${lp.dayKey}) ${this.cfg.claudio_hours.tz}`;
      const res = await this.ai.triage({
        what: ticket.description,
        where: ticket.location,
        context: ticket.context,
        localTime,
        openTickets: this.openContext(ticket.id),
      });
      if (res) {
        this.consecutiveFallbacks = 0;
        const d = this.fromAI(res.output);
        // a duplicate must point at a real, open ticket
        if (d.duplicate_of !== null && !this.db.listOpen().some((t) => t.id === d.duplicate_of)) {
          d.duplicate_of = null;
          d.duplicate_confidence = 0;
        }
        return d;
      }
      this.consecutiveFallbacks++;
      log.warn({ ticket: ticket.id, consecutive: this.consecutiveFallbacks }, "triage fell back to keywords");
    }
    return this.keywords(ticket);
  }
}
