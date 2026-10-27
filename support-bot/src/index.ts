/**
 * Bootstrap: config (fails loudly on placeholders), DB + migrations, Discord
 * gateway with the intents/partials from §2.3, Airtable schema check, handlers,
 * cron jobs, /health.
 */
import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import cron from "node-cron";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { App } from "./app.js";
import { ConfigError, loadChatIntakePrompt, loadConfig, loadDotEnv, loadEnv, loadPrompt, loadTicketQaPrompt } from "./config.js";
import { Db } from "./db.js";
import { ensureDatabase } from "./seed.js";
import { log } from "./log.js";
import { AirtableMirror } from "./airtable.js";
import { OpsAlerts } from "./ops.js";
import { PinnedPost } from "./pinnedPost.js";
import { StandingQueue } from "./queue.js";
import { opsOnline } from "./render.js";
import { TriageAI } from "./triage/ai.js";
import { TriageService } from "./triage/index.js";
import { registerInteractions } from "./handlers/interactions.js";
import { registerReactions } from "./handlers/reactions.js";
import { registerThreadMessages } from "./handlers/threadMessages.js";
import { registerChatIntake } from "./handlers/chatIntake.js";
import { priorityTimeoutJob } from "./jobs/priorityTimeout.js";
import { nudgesJob } from "./jobs/nudges.js";
import { mirrorRetryJob } from "./jobs/mirrorRetry.js";
import { archiveThreadsJob } from "./jobs/archiveThreads.js";
import { weeklyDigestJob } from "./jobs/weeklyDigest.js";
import { opsAlertsJob } from "./jobs/opsAlerts.js";
import { syncFromAirtable } from "./airtableSync.js";

function readVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    for (const p of [path.resolve(here, "../package.json"), path.resolve(here, "../../package.json")]) {
      if (fs.existsSync(p)) return (JSON.parse(fs.readFileSync(p, "utf8")) as { version: string }).version;
    }
  } catch {
    /* ignore */
  }
  return "0.0.0";
}

async function main(): Promise<void> {
  loadDotEnv();
  let env, cfg, prompt, chatPrompt, qaPrompt;
  try {
    env = loadEnv();
    cfg = loadConfig(env.CONFIG_PATH);
    prompt = loadPrompt(cfg);
    chatPrompt = loadChatIntakePrompt(cfg);
    qaPrompt = loadTicketQaPrompt(cfg);
  } catch (err) {
    if (err instanceof ConfigError) {
      // E30 — refuse to start and name the key
      console.error(`\n✖ ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
  process.env.TZ = env.TZ;

  try {
    const seeded = await ensureDatabase({ dbPath: env.DATABASE_PATH, seedUrl: env.SEED_DATABASE_URL, allowFresh: env.ALLOW_FRESH_DATABASE });
    if (seeded !== "existing") log.warn({ seeded, path: env.DATABASE_PATH }, "database created");
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`\n✖ ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
  const db = new Db(env.DATABASE_PATH, cfg.airtable.first_ticket_number);
  fs.mkdirSync(env.PHOTO_DIR, { recursive: true });

  const ai = env.TRIAGE_ENABLED && env.ANTHROPIC_API_KEY ? new TriageAI(env.ANTHROPIC_API_KEY, env.TRIAGE_MODEL, prompt) : null;
  if (!ai) log.warn({ enabled: env.TRIAGE_ENABLED, hasKey: !!env.ANTHROPIC_API_KEY }, "AI triage disabled — keyword fallback only");
  const triage = new TriageService(cfg, db, ai);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Message, Partials.Reaction, Partials.Channel, Partials.User],
    allowedMentions: { parse: [], repliedUser: false },
  });

  const mirror = new AirtableMirror(env.AIRTABLE_TOKEN, cfg, db);

  // Verify the live Airtable schema before we accept a single ticket (§3.3).
  if (mirror.enabled) {
    try {
      await mirror.verifySchema();
    } catch (err) {
      console.error(`\n✖ ${(err as Error).message}\n`);
      process.exit(1);
    }
  }

  const appRef: { app: App | null } = { app: null };
  const getApp = () => {
    if (!appRef.app) throw new Error("app not ready");
    return appRef.app;
  };
  const queue = new StandingQueue(getApp);
  const pinned = new PinnedPost(getApp);

  client.once(Events.ClientReady, async (ready) => {
    const app: App = {
      cfg,
      env,
      db,
      client: ready,
      log,
      triage,
      ai,
      mirror,
      ops: new OpsAlerts(ready, db, env.OPS_ALERT_USER_ID || cfg.ops.alert_user_id, cfg.ops.alert_rate_limit_per_hour),
      queue,
      pinnedPost: pinned,
      version: readVersion(),
      startedAt: new Date(),
    };
    appRef.app = app;

    registerInteractions(app);
    registerReactions(app);
    registerThreadMessages(app);
    registerChatIntake(app, chatPrompt, qaPrompt);

    cron.schedule("*/30 * * * * *", () => void priorityTimeoutJob(app).catch((e) => log.error({ e }, "priorityTimeout job")));
    cron.schedule("*/5 * * * *", () => void nudgesJob(app).catch((e) => log.error({ e }, "nudges job")));
    cron.schedule("* * * * *", () => void mirrorRetryJob(app).catch((e) => log.error({ e }, "mirrorRetry job")));
    cron.schedule("0 * * * *", () => void archiveThreadsJob(app).catch((e) => log.error({ e }, "archiveThreads job")));
    cron.schedule(cfg.digest.cron, () => void weeklyDigestJob(app).catch((e) => log.error({ e }, "weeklyDigest job")), { timezone: cfg.claudio_hours.tz });
    cron.schedule("*/5 * * * *", () => void opsAlertsJob(app).catch((e) => log.error({ e }, "opsAlerts job")));
    // Airtable is a place people work tickets too: apply their edits every minute
    cron.schedule("15 * * * * *", () => void syncFromAirtable(app));

    log.info({ user: ready.user.tag, guild: cfg.guild_id, version: app.version, ai: !!ai, airtable: mirror.enabled }, "Mox Support Bot online");
    await pinned.ensure().catch((e) => log.error({ e }, "pinned post"));
    await queue.rebuild().catch((e) => log.error({ e }, "standing queue"));
    await app.ops.send("boot", opsOnline(app.version), true);
    void mirrorRetryJob(app).catch(() => undefined);
  });

  // /health — the only HTTP surface (§9.2)
  http
    .createServer((req, res) => {
      if (req.url === "/health") {
        const body = JSON.stringify({
          ok: client.isReady(),
          uptime: Math.round(process.uptime()),
          queueDepth: db.mirrorQueueDepth(),
          open: db.listOpen().length,
          triage: ai ? "ai" : "keywords",
          consecutiveFallbacks: triage.consecutiveFallbacks,
        });
        res.writeHead(client.isReady() ? 200 : 503, { "content-type": "application/json" }).end(body);
      } else res.writeHead(404).end();
    })
    .listen(env.HEALTH_PORT, () => log.info({ port: env.HEALTH_PORT }, "/health listening"));

  const shutdown = (sig: string) => {
    log.info({ sig }, "shutting down");
    client.destroy();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", (err) => log.error({ err }, "unhandled rejection"));

  try {
    await client.login(env.DISCORD_TOKEN);
  } catch (err) {
    if (err instanceof Error && /disallowed intents/i.test(err.message)) {
      console.error(
        "\n✖ Discord refused the connection: privileged intents are off.\n" +
          "  Fix: discord.com/developers/applications → Mox Support → Bot → Privileged Gateway Intents →\n" +
          "  turn ON both \"Server Members Intent\" and \"Message Content Intent\", save, then restart the bot.\n",
      );
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  log.fatal({ err }, "fatal");
  process.exit(1);
});
