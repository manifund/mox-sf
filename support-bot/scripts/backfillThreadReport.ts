/** `npx tsx scripts/backfillThreadReport.ts <ticketId> <threadId>` — rebuild a ticket's description from the reporter's messages in a thread, verbatim, and attach their photos. */
import fs from "node:fs";
import path from "node:path";
import { Client, GatewayIntentBits, type Message } from "discord.js";
import { loadConfig, loadDotEnv, loadEnv } from "../src/config.js";
import { RESYNC_PREFIX } from "../src/core/resync.js";
import { Db } from "../src/db.js";
import { joinReporterParts, summaryFromWords, titleFromWords } from "../src/triage/wording.js";

loadDotEnv();
const env = loadEnv();
const cfg = loadConfig(env.CONFIG_PATH);
const [ticketId, threadId] = [Number(process.argv[2]), process.argv[3]!];
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
c.once("clientReady", async () => {
  const db = new Db(env.DATABASE_PATH, cfg.airtable.first_ticket_number);
  try {
    const th = await c.channels.fetch(threadId);
    if (!th || !th.isThread()) throw new Error("not a thread");
    const starter = await th.fetchStarterMessage();
    if (!starter) throw new Error("no starter message");
    const inside = [...(await th.messages.fetch({ limit: 50 })).values()]
      .filter((m: Message) => m.author.id === starter.author.id && !m.system && m.id !== starter.id)
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const description = joinReporterParts([starter.content, ...inside.map((m) => m.content)]);
    db.updateTicket(ticketId, { description, title: titleFromWords(description), staff_summary: summaryFromWords(description), digest_summary: null });
    console.log(`description now:\n${description}\n`);
    let n = db.photos(ticketId).length;
    for (const m of [starter, ...inside]) {
      for (const a of m.attachments.values()) {
        const type = (a.contentType ?? "").split(";")[0]!.trim();
        if (!cfg.photos.types.includes(type)) continue;
        const res = await fetch(a.url);
        if (!res.ok) continue;
        const dir = path.join(env.PHOTO_DIR, String(ticketId));
        fs.mkdirSync(dir, { recursive: true });
        n += 1;
        const local = path.join(dir, `${n}.${EXT[type] ?? "bin"}`);
        fs.writeFileSync(local, Buffer.from(await res.arrayBuffer()));
        const photo = db.addPhoto({ ticket_id: ticketId, discord_url: a.url, local_path: local, content_type: type });
        db.enqueueMirror(ticketId, "upload_photo", { photoId: photo.id });
        console.log(`photo saved: ${local} (${a.size} bytes)`);
      }
    }
    db.kvSet(`${RESYNC_PREFIX}${ticketId}`, new Date().toISOString());
    console.log("resync requested (Airtable + cards)");
  } finally {
    db.close();
    c.destroy();
  }
});
await c.login(env.DISCORD_TOKEN);
