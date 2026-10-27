/**
 * The Haiku call (§4.4). One tool-use request per ticket, 8s timeout, one retry,
 * schema-validated output. Anything else -> null, and the caller falls back to keywords.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CATEGORIES, KINDS, SUGGESTED_OWNERS } from "../config.js";
import { log } from "../log.js";

export const TriageOutput = z.object({
  kind: z.enum(KINDS),
  category: z.enum(CATEGORIES),
  assessed_priority: z.enum(["P0", "P1", "P2"]),
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(200),
  suggested_owner: z.enum(SUGGESTED_OWNERS),
  owner_reasoning: z.string().max(240).default(""),
  duplicate_of: z.number().int().nullable().optional().default(null),
  duplicate_confidence: z.number().min(0).max(1).optional().default(0),
  reasoning: z.string().max(400).optional().default(""),
  confidence: z.number().min(0).max(1),
});
export type TriageOutput = z.infer<typeof TriageOutput>;

export const TRIAGE_TOOL: Anthropic.Tool = {
  name: "triage_ticket",
  description: "File the incoming building request: kind, category, urgency, owner, title and summary.",
  input_schema: {
    type: "object",
    required: ["kind", "category", "assessed_priority", "title", "summary", "suggested_owner", "owner_reasoning", "confidence"],
    properties: {
      kind: { type: "string", enum: [...KINDS] },
      category: { type: "string", enum: [...CATEGORIES] },
      assessed_priority: { type: "string", enum: ["P0", "P1", "P2"] },
      title: { type: "string", maxLength: 80, description: "Plain, under 80 chars, no ticket number." },
      summary: { type: "string", maxLength: 140, description: "One line for the staff card, under 140 chars." },
      // `contractors` is deliberately absent — the clock decides that, never the model (§4.4.2)
      suggested_owner: { type: "string", enum: SUGGESTED_OWNERS.filter((o) => o !== "contractors") },
      owner_reasoning: { type: "string", maxLength: 160, description: "One plain sentence for staff on why this owner." },
      duplicate_of: { type: ["integer", "null"], description: "id of an open ticket this duplicates, else null" },
      duplicate_confidence: { type: "number", minimum: 0, maximum: 1 },
      reasoning: { type: "string", maxLength: 200 },
      confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence in the CATEGORY." },
    },
  },
};

export const ChatGateOutput = z.object({
  kind: z.enum(["issue", "idea", "none"]),
  /** kept for older callers; true when kind === "issue" */
  is_report: z.boolean().optional().default(false),
  // be lenient: an over-long string or an unknown category must not throw the whole answer away
  category: z.preprocess((v) => ((CATEGORIES as readonly string[]).includes(v as string) ? v : null), z.enum(CATEGORIES).nullable()).optional().default(null),
  location: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : null), z.string().nullable()).optional().default(null),
  confidence: z.coerce.number().min(0).max(1),
  reason: z.preprocess((v) => (typeof v === "string" ? v.slice(0, 300) : ""), z.string()).optional().default(""),
});
export type ChatGateOutput = z.infer<typeof ChatGateOutput>;

export const CHAT_GATE_TOOL: Anthropic.Tool = {
  name: "classify_chat",
  description: "Decide whether a chat message is a present-tense report of a physical building problem (issue), a wish for something new (idea), or neither (none).",
  input_schema: {
    type: "object",
    required: ["kind", "confidence"],
    properties: {
      kind: { type: "string", enum: ["issue", "idea", "none"] },
      category: { type: ["string", "null"], enum: [...CATEGORIES, null] },
      location: { type: ["string", "null"], maxLength: 100, description: "Floor/room if stated, else null." },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reason: { type: "string", maxLength: 200 },
    },
  },
};

export const TicketCommand = z.object({
  action: z.enum(["answer", "set_priority", "reassign", "make_work_item", "make_idea", "close", "wont_do"]),
  priority: z.preprocess((v) => (["P0", "P1", "P2"].includes(v as string) ? v : null), z.enum(["P0", "P1", "P2"]).nullable()).optional().default(null),
  owner: z.preprocess((v) => (typeof v === "string" && v ? v : null), z.string().nullable()).optional().default(null),
  reason: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null), z.string().nullable()).optional().default(null),
});
export type TicketCommand = z.infer<typeof TicketCommand>;

const TICKET_COMMAND_TOOL: Anthropic.Tool = {
  name: "ticket_command",
  description: "Classify a staff member's message about a ticket as an action to take, or a question to answer.",
  input_schema: {
    type: "object",
    required: ["action"],
    properties: {
      action: { type: "string", enum: ["answer", "set_priority", "reassign", "make_work_item", "make_idea", "close", "wont_do"] },
      priority: { type: ["string", "null"], enum: ["P0", "P1", "P2", null] },
      owner: { type: ["string", "null"], enum: ["jake", "carolina", "robin", "claudio", "contractors", "all_staff", null] },
      reason: { type: ["string", "null"], maxLength: 300 },
    },
  },
};

export interface OpenTicketContext {
  id: number;
  title: string;
  category: string;
  location: string;
  age: string;
}

export interface TriageRequest {
  what: string;
  where: string;
  context?: string | null;
  localTime: string;
  openTickets: OpenTicketContext[];
}

export class TriageAI {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly systemPrompt: string,
    private readonly timeoutMs = 8000,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 0, timeout: timeoutMs });
  }

  buildUserMessage(req: TriageRequest): string {
    const open = req.openTickets.length
      ? req.openTickets.map((t) => `${t.id} · ${t.title} · ${t.category} · ${t.location} · ${t.age}`).join("\n")
      : "(none)";
    return [
      `Local time: ${req.localTime}`,
      ``,
      `What: ${req.what}`,
      `Where: ${req.where}`,
      req.context ? `Anything else: ${req.context}` : ``,
      ``,
      `Open tickets (id · title · category · location · age):`,
      open,
      ``,
      `Call triage_ticket exactly once.`,
    ]
      .filter((l) => l !== undefined)
      .join("\n");
  }

  /** Returns validated output, or null after one retry. Never throws. */
  async triage(req: TriageRequest): Promise<{ output: TriageOutput; attempts: number } | null> {
    const user = this.buildUserMessage(req);
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await this.client.messages.create({
          model: this.model,
          max_tokens: 1024,
          system: [{ type: "text", text: this.systemPrompt, cache_control: { type: "ephemeral" } }],
          tools: [TRIAGE_TOOL],
          tool_choice: { type: "tool", name: "triage_ticket" },
          messages: [{ role: "user", content: user }],
        });
        const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
        if (!block) {
          log.warn({ attempt, stop: res.stop_reason }, "triage: no tool_use block");
          continue;
        }
        const parsed = TriageOutput.safeParse(block.input);
        if (!parsed.success) {
          log.warn({ attempt, issues: parsed.error.issues }, "triage: schema validation failed");
          continue;
        }
        return { output: parsed.data, attempts: attempt };
      } catch (err) {
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
          log.error({ err: err.message }, "triage: auth error — not retrying");
          return null;
        }
        if (err instanceof Anthropic.APIConnectionTimeoutError) log.warn({ attempt }, "triage: timeout");
        else if (err instanceof Anthropic.RateLimitError) log.warn({ attempt }, "triage: rate limited");
        else if (err instanceof Anthropic.APIError) log.warn({ attempt, status: err.status, msg: err.message }, "triage: API error");
        else log.warn({ attempt, err }, "triage: unexpected error");
        if (attempt === 2) return null;
      }
    }
    return null;
  }

  /** Chat intake gate: one small call per message. Null on any failure, which the caller treats as "no". */
  async classifyChat(systemPrompt: string, message: string, authorIsStaff: boolean): Promise<ChatGateOutput | null> {
    try {
      const res = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 300,
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          tools: [CHAT_GATE_TOOL],
          tool_choice: { type: "tool", name: "classify_chat" },
          messages: [{ role: "user", content: `Author is ${authorIsStaff ? "a staff member" : "a member"}.\nMessage:\n${message}` }],
        },
        { timeout: 6000 },
      );
      const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (!block) {
        log.warn({ stop: res.stop_reason }, "chat gate: no tool_use block");
        return null;
      }
      const parsed = ChatGateOutput.safeParse(block.input);
      if (!parsed.success) log.warn({ issues: parsed.error.issues, input: block.input }, "chat gate: answer failed validation");
      return parsed.success ? parsed.data : null;
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : err }, "chat gate: model call failed");
      return null;
    }
  }

  /** What a staff member wants done with a ticket. Null on failure, which the caller treats as "answer". */
  async ticketCommand(systemPrompt: string, user: string): Promise<TicketCommand | null> {
    try {
      const res = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 300,
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          tools: [TICKET_COMMAND_TOOL],
          tool_choice: { type: "tool", name: "ticket_command" },
          messages: [{ role: "user", content: user }],
        },
        { timeout: 8000 },
      );
      const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const parsed = block ? TicketCommand.safeParse(block.input) : null;
      if (parsed && !parsed.success) log.warn({ issues: parsed.error.issues }, "ticket command: validation failed");
      return parsed?.success ? parsed.data : null;
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : err }, "ticket command: model call failed");
      return null;
    }
  }

  /** Plain text completion used by the weekly digest recap (§9.3). Returns null on any failure. */
  async complete(system: string, user: string, maxTokens = 600): Promise<string | null> {
    try {
      const res = await this.client.messages.create(
        { model: this.model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] },
        { timeout: 20000 },
      );
      return res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : err }, "digest recap: model call failed");
      return null;
    }
  }
}
