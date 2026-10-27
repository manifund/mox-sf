/** `npm run check-config` — the same validation the bot runs at boot, without connecting anywhere. */
import { ConfigError, loadConfig, loadDotEnv, loadEnv, loadPrompt } from "../src/config.js";

loadDotEnv();
try {
  const env = loadEnv();
  const cfg = loadConfig(env.CONFIG_PATH);
  loadPrompt(cfg);
  console.log(`✓ config.yaml valid — guild ${cfg.guild_id}, ${Object.keys(cfg.owners).length} owners, ${Object.keys(cfg.category_owner).length} categories`);
  console.log(`✓ .env valid — triage ${env.TRIAGE_ENABLED && env.ANTHROPIC_API_KEY ? `on (${env.TRIAGE_MODEL})` : "OFF (keywords only)"}, airtable ${env.AIRTABLE_TOKEN ? "on" : "OFF"}`);
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  }
  throw err;
}
