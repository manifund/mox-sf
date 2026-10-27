/** `npx tsx scripts/inspectChannel.ts [channelKey]` — permission overwrites and pin state for one configured channel. Read-only. */
import { Client, GatewayIntentBits, PermissionFlagsBits } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const key = (process.argv[2] ?? "report_an_issue") as keyof typeof cfg.channels;
const c = new Client({ intents: [GatewayIntentBits.Guilds] });
c.once("clientReady", async () => {
  const g = await c.guilds.fetch(cfg.guild_id);
  const me = await g.members.fetchMe();
  const ch = await g.channels.fetch(cfg.channels[key]).catch(() => null);
  if (!ch || !("permissionOverwrites" in ch)) {
    console.log(`${key}: bot cannot see this channel`);
    c.destroy();
    return;
  }
  console.log(`#${ch.name} · category: ${ch.parent?.name ?? "(none)"} · synced with category: ${ch.permissionsLocked}`);
  console.log(`bot ManageMessages — guild-level: ${me.permissions.has(PermissionFlagsBits.ManageMessages)} · effective here: ${ch.permissionsFor(me).has(PermissionFlagsBits.ManageMessages)}`);
  for (const o of ch.permissionOverwrites.cache.values()) {
    const who = o.type === 0 ? `role ${g.roles.cache.get(o.id)?.name ?? o.id}` : `member ${o.id}${o.id === me.id ? " (this bot)" : ""}`;
    console.log(`  overwrite ${who}: allow=[${o.allow.toArray().join(",")}] deny=[${o.deny.toArray().join(",")}]`);
  }
  if (ch.isTextBased()) {
    const pins = await ch.messages.fetchPins().catch((e: Error) => e.message);
    console.log(`pins: ${typeof pins === "string" ? "error: " + pins : pins.items.length + " pinned"}`);
  }
  c.destroy();
});
await c.login(env.DISCORD_TOKEN);
