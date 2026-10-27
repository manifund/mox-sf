/**
 * Loads config.yaml + .env, validates both, and refuses to start while any
 * `<<PLACEHOLDER>>` remains (spec E30). Routing, hours, categories and the
 * triage prompt all live here, never in code (C7).
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const OWNER_KEYS = [
  "jake",
  "whit",
  "carolina",
  "robin",
  "claudio",
  "contractors",
  "all_staff",
  "unassigned",
] as const;
export type OwnerKey = (typeof OWNER_KEYS)[number];

export const CATEGORIES = [
  "safety",
  "door_codes",
  "plumbing",
  "utilities",
  "furniture",
  "appliance",
  "security",
  "stocking",
  "cleaning",
  "cosmetic",
  "events",
  "operations",
  "space",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
export type Priority = (typeof PRIORITIES)[number];
export type PickablePriority = "P0" | "P1" | "P2";

export const KINDS = ["issue", "idea", "question"] as const;
export type Kind = (typeof KINDS)[number];

/** What the model may name as an owner (§4.4.2). `facilities` is resolved through the rota. */
export const SUGGESTED_OWNERS = ["facilities", "carolina", "robin", "claudio", "contractors", "all_staff"] as const;
export type SuggestedOwner = (typeof SUGGESTED_OWNERS)[number];

const snowflake = z.string().regex(/^\d{15,22}$/, "must be a Discord snowflake id");
const hhmm = z.string().regex(/^\d{1,2}:\d{2}$/);

const OwnerSchema = z.object({
  display_name: z.string().min(1),
  mention_user_ids: z.array(snowflake).default([]),
  mention_role_id: snowflake.optional(),
  delivery: z.enum(["thread", "channel", "none"]),
  channel_id: snowflake.optional(),
  p0_channel_id: snowflake.optional(),
});
export type OwnerConfig = z.infer<typeof OwnerSchema>;

const CategoryTarget = z.enum([...OWNER_KEYS, "facilities_rota", "time_based", "ai_judgment"]);
export type CategoryTarget = z.infer<typeof CategoryTarget>;

const HoursSchema = z.object({
  start: hhmm,
  end: hhmm,
  days: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).min(1),
  tz: z.string().min(1),
});

export const ConfigSchema = z.object({
  guild_id: snowflake,
  channels: z.object({
    report_an_issue: snowflake,
    team_jake: snowflake,
    team_carolina: snowflake,
    team_claudio: snowflake,
    team_robin: snowflake,
    mox_contractor_requests: snowflake,
    digest: snowflake,
  }),
  roles: z.object({ mox_staff: snowflake }),
  users: z.record(z.string(), snowflake),
  owners: z.partialRecord(z.enum(OWNER_KEYS), OwnerSchema),
  category_owner: z.record(z.enum(CATEGORIES), CategoryTarget),
  rota: z.object({
    facilities: z.array(z.enum(OWNER_KEYS)).min(1),
    strategy: z.literal("ticket_parity"),
    p0_mention_all: z.boolean().default(true),
  }),
  triage: z.object({
    category_confidence_floor: z.number().min(0).max(1).default(0.6),
    judgment_default_owner: z.enum(OWNER_KEYS).default("carolina"),
    prompt_path: z.string().default("prompts/triage.md"),
  }),
  claudio_hours: HoursSchema,
  /** Window used for "staffed hours" nudge arithmetic (§9.1). */
  staffed_hours: HoursSchema.default({
    start: "05:00",
    end: "17:00",
    days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    tz: "America/Los_Angeles",
  }),
  escalation: z.object({
    p0_no_claim_minutes: z.number().int().positive().default(20),
    p1_no_claim_staffed_hours: z.number().positive().default(4),
    p0_never_to_contractors: z.boolean().default(true),
  }),
  priority_timeout_seconds: z.number().int().positive().default(180),
  /** Public tickets were removed 2026-10-01 (private issues only). Kept optional so old configs still load. */
  public: z
    .object({
      channel_id: snowflake,
      allow_staff_publish: z.boolean().default(true),
    })
    .optional(),
  standing_queue: z.object({
    channel_id: snowflake,
    debounce_seconds: z.number().positive().default(5),
    max_rows: z.number().int().positive().default(25),
  }),
  digest: z.object({
    channel_id: snowflake,
    cron: z.string().default("0 9 * * 1"),
    closed_summary: z.enum(["ai", "plain"]).default("ai"),
    closed_summary_max_bullets: z.number().int().positive().default(4),
    ideas_reviewer: z.string().nullable().default(null),
    ideas_show_count: z.boolean().default(true),
    ideas_show_oldest_age: z.boolean().default(true),
  }),
  photos: z.object({
    max_per_ticket: z.number().int().positive().default(5),
    max_bytes: z.number().int().positive().default(10 * 1024 * 1024),
    types: z.array(z.string()).default(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  }),
  ops: z.object({
    alert_user_id: snowflake,
    alert_rate_limit_per_hour: z.number().positive().default(1),
  }),
  airtable: z.object({
    base_id: z.string().regex(/^app[A-Za-z0-9]{14}$/, "must be an Airtable base id (app…)"),
    table_id: z.string().regex(/^tbl[A-Za-z0-9]{14}$/, "must be an Airtable table id (tbl…)"),
    view_id: z.string().regex(/^viw[A-Za-z0-9]{14}$/).optional(),
    first_ticket_number: z.number().int().positive().default(100),
    /** Safety valve: more rows than this vanishing in one sync looks like a broken read, not deletions. */
    max_removals_per_sync: z.number().int().positive().default(15),
    /** Link to the board, for footers and links. */
    board_url: z.string().url().optional(),
  }),
  /** Watch chat channels and open a ticket when a message is clearly a building report (no form). */
  chat_intake: z
    .object({
      enabled: z.boolean().default(false),
      channel_ids: z.array(snowflake).default([]),
      /** below this the bot stays silent */
      min_confidence: z.number().min(0).max(1).default(0.8),
      /** categories eligible for auto-intake; anything else is ignored even if confident */
      categories: z.array(z.enum(CATEGORIES)).default(["safety", "plumbing", "utilities", "furniture", "appliance", "security", "stocking", "cleaning", "cosmetic", "door_codes", "events"]),
      prompt_path: z.string().default("prompts/chat-intake.md"),
      min_chars: z.number().int().positive().default(12),
      tag_decline_confidence: z.number().min(0).max(1).default(0.9),
      /**
       * Stocking and ideas are where the bot knows least (staff often know the thing exists somewhere).
       * These wait, give staff the first word, and need a higher confidence. Building problems don't wait.
       */
      cautious: z
        .object({
          categories: z.array(z.enum(CATEGORIES)).default(["stocking"]),
          include_ideas: z.boolean().default(true),
          min_confidence: z.number().min(0).max(1).default(0.9),
          /** wait this long; if staff replied in the meantime, stay silent */
          wait_minutes: z.number().min(0).default(15),
        })
        .default({ categories: ["stocking"], include_ideas: true, min_confidence: 0.9, wait_minutes: 15 }),
    })
    .default({
      enabled: false,
      channel_ids: [],
      min_confidence: 0.8,
      categories: ["safety", "plumbing", "utilities", "furniture", "appliance", "security", "stocking", "cleaning", "cosmetic", "door_codes", "events"],
      prompt_path: "prompts/chat-intake.md",
      min_chars: 12,
      tag_decline_confidence: 0.9,
      cautious: { categories: ["stocking"], include_ideas: true, min_confidence: 0.9, wait_minutes: 15 },
    }),
  /** Answering questions about a ticket when someone tags the bot about it. */
  ticket_qa: z
    .object({
      prompt_path: z.string().default("prompts/ticket-qa.md"),
      command_prompt_path: z.string().default("prompts/ticket-command.md"),
      thread_messages: z.number().int().positive().default(30),
    })
    .default({ prompt_path: "prompts/ticket-qa.md", command_prompt_path: "prompts/ticket-command.md", thread_messages: 30 }),
  /** discord user id -> owner key, used by /log. Defaults derived from owners.mention_user_ids. */
  staff_map: z.record(snowflake, z.enum(OWNER_KEYS)).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export const EnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  TRIAGE_MODEL: z.string().min(1).default("claude-haiku-4-5-20251001"),
  TRIAGE_ENABLED: z
    .string()
    .default("true")
    .transform((v) => !["false", "0", "no", "off"].includes(v.toLowerCase())),
  AIRTABLE_TOKEN: z.string().min(1).optional(),
  OPS_ALERT_USER_ID: z.string().optional(),
  DATABASE_PATH: z.string().default("./data/mox.db"),
  PHOTO_DIR: z.string().default("./data/photos"),
  // Railway (and most hosts) hand the app a PORT; use it unless HEALTH_PORT is set explicitly
  HEALTH_PORT: z.coerce.number().int().default(Number(process.env.PORT ?? 8080)),
  /** One-time: download this SQLite file into DATABASE_PATH when it doesn't exist yet (moving hosts). */
  SEED_DATABASE_URL: z.string().url().optional(),
  /** Starting with no database is refused unless this is "true": an empty one restarts ticket numbering. */
  ALLOW_FRESH_DATABASE: z
    .string()
    .default("false")
    .transform((v) => ["true", "1", "yes"].includes(v.toLowerCase())),
  TZ: z.string().default("America/Los_Angeles"),
  LOG_LEVEL: z.string().default("info"),
  CONFIG_PATH: z.string().default("config.yaml"),
});
export type Env = z.infer<typeof EnvSchema>;

/** Walk any parsed value and report every string that still looks like a placeholder. */
export function findPlaceholders(value: unknown, trail = "config"): string[] {
  const hits: string[] = [];
  if (typeof value === "string") {
    if (/<<[^>]*>>/.test(value) || value.trim() === "NONE") hits.push(trail);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...findPlaceholders(v, `${trail}[${i}]`)));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) hits.push(...findPlaceholders(v, `${trail}.${k}`));
  }
  return hits;
}

export class ConfigError extends Error {}

export function loadConfigFromString(yamlText: string): Config {
  const raw: unknown = parseYaml(yamlText);
  const placeholders = findPlaceholders(raw);
  if (placeholders.length) {
    throw new ConfigError(
      `config.yaml still contains ${placeholders.length} placeholder(s) — fill these in first:\n  ` +
        placeholders.join("\n  "),
    );
  }
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new ConfigError(`config.yaml failed validation:\n${lines.join("\n")}`);
  }
  const cfg = parsed.data;
  crossCheck(cfg);
  return cfg;
}

function crossCheck(cfg: Config): void {
  const problems: string[] = [];
  for (const [key, o] of Object.entries(cfg.owners)) {
    if (o.delivery === "channel" && !o.channel_id) problems.push(`owners.${key}: delivery=channel needs channel_id`);
    if (o.delivery === "thread" && !o.p0_channel_id) problems.push(`owners.${key}: delivery=thread needs p0_channel_id`);
  }
  for (const [cat, target] of Object.entries(cfg.category_owner)) {
    if (
      target !== "facilities_rota" &&
      target !== "time_based" &&
      target !== "ai_judgment" &&
      !cfg.owners[target as OwnerKey]
    )
      problems.push(`category_owner.${cat}: unknown owner "${target}"`);
  }
  for (const k of cfg.rota.facilities) if (!cfg.owners[k]) problems.push(`rota.facilities: unknown owner "${k}"`);
  if (!cfg.owners.unassigned) problems.push(`owners.unassigned is required (ideas)`);
  if (!cfg.owners.carolina) problems.push(`owners.carolina is required (judgment default)`);
  if (!cfg.owners.claudio) problems.push(`owners.claudio is required (time-based routing)`);
  if (!cfg.owners.contractors) problems.push(`owners.contractors is required (time-based routing)`);
  if (!cfg.owners.all_staff) problems.push(`owners.all_staff is required (safety)`);
  if (problems.length) throw new ConfigError(`config.yaml cross-check failed:\n  ${problems.join("\n  ")}`);
}

export function loadConfig(configPath: string): Config {
  const abs = path.resolve(configPath);
  if (!fs.existsSync(abs)) throw new ConfigError(`config file not found at ${abs}`);
  return loadConfigFromString(fs.readFileSync(abs, "utf8"));
}

export function loadEnv(env: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new ConfigError(`.env failed validation:\n${lines.join("\n")}`);
  }
  const e = parsed.data;
  const ph = findPlaceholders(
    Object.fromEntries(Object.entries(e).filter(([, v]) => typeof v === "string")),
    "env",
  );
  if (ph.length) throw new ConfigError(`.env still contains placeholders: ${ph.join(", ")}`);
  return e;
}

/** Minimal .env reader — no dependency, no interpolation, never overrides real env. */
export function loadDotEnv(file = ".env"): void {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) return;
  for (const raw of fs.readFileSync(abs, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    const hash = val.search(/\s#/);
    if (hash >= 0 && !/^["']/.test(val)) val = val.slice(0, hash).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

export function loadPrompt(cfg: Config): string {
  const abs = path.resolve(cfg.triage.prompt_path);
  if (!fs.existsSync(abs)) throw new ConfigError(`triage prompt not found at ${abs}`);
  return fs.readFileSync(abs, "utf8");
}

export function loadTicketQaPrompt(cfg: Config): string {
  const abs = path.resolve(cfg.ticket_qa.prompt_path);
  if (!fs.existsSync(abs)) throw new ConfigError(`ticket Q&A prompt not found at ${abs}`);
  return fs.readFileSync(abs, "utf8");
}

export function loadChatIntakePrompt(cfg: Config): string {
  const abs = path.resolve(cfg.chat_intake.prompt_path);
  if (!fs.existsSync(abs)) throw new ConfigError(`chat intake prompt not found at ${abs}`);
  return fs.readFileSync(abs, "utf8");
}

/** discord user id -> owner key. Explicit staff_map wins; otherwise derived from mention_user_ids. */
export function staffMap(cfg: Config): Record<string, OwnerKey> {
  const map: Record<string, OwnerKey> = {};
  for (const [key, o] of Object.entries(cfg.owners) as [OwnerKey, OwnerConfig][]) {
    if (key === "all_staff" || key === "unassigned") continue;
    for (const uid of o.mention_user_ids) map[uid] = key;
  }
  return { ...map, ...(cfg.staff_map ?? {}) };
}

export function ownerDisplay(cfg: Config, key: OwnerKey | string | null | undefined): string {
  if (!key) return "Unassigned";
  // a departed owner's old tickets still read as a name, not a config key
  return cfg.owners[key as OwnerKey]?.display_name ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
}
