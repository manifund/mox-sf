/** Messages inside ticket threads: photos (§7.7), `bump` (§5.3), reopen (§5.4), resolution notes (§6.4). */
import { Events, type Message } from "discord.js";
import fs from "node:fs";
import path from "node:path";
import type { App } from "../app.js";
import * as actions from "../core/actions.js";
import { postInThread } from "../core/flow.js";
import { refreshSurfaces } from "../cards.js";
import { displayNameOf, isStaffUser } from "../discord.js";
import { archivedReopenHint, bumpAck, bumpStaffNotice, noteSaved } from "../render.js";
import { ticketRef } from "../util/ids.js";
import { botTagged } from "./chatIntake.js";
import { deliveryPlan } from "../routing.js";
import { mentionUsers } from "../render.js";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

export function registerThreadMessages(app: App): void {
  app.client.on(Events.MessageCreate, (m) => void handle(app, m));
}

async function handle(app: App, message: Message): Promise<void> {
  try {
    if (message.author.bot) return;
    if (!message.channel.isThread()) return;
    const t = app.db.getTicketByThread(message.channel.id);
    if (!t) return;

    // photos first — they're welcome at any point in the ticket's life
    if (message.attachments.size) await ingestPhotos(app, t.id, message);

    // tagging the bot in a ticket thread is a question for it (handled in chatIntake), not a reply
    if (botTagged(app, message)) return;
    const text = message.content.trim();
    const isReporter = message.author.id === t.reporter_id;
    const isStaff = await isStaffUser(app.client, app.cfg, message.author.id);

    if (/^bump\b/i.test(text) && (isReporter || isStaff)) {
      const fresh = app.db.getTicket(t.id)!;
      app.db.recordEvent(t.id, "bump", message.author.id);
      const plan = deliveryPlan(app.cfg, fresh.owner_key ?? "unassigned", fresh.priority ?? "P1");
      await postInThread(app, fresh, bumpAck());
      if (plan.mentionUserIds.length)
        await postInThread(app, fresh, `${mentionUsers(plan.mentionUserIds)} ${bumpStaffNotice(message.author.displayName)}`, { allowedMentions: { users: plan.mentionUserIds } });
      return;
    }

    // chat-intake ticket with no location yet: the reporter's first reply is the location
    if (isReporter && t.source === "chat" && t.location === "Not stated" && text && text.length <= 100 && !/^bump\b/i.test(text)) {
      app.db.updateTicket(t.id, { location: text });
      await message.react("📍").catch(() => undefined);
      await refreshSurfaces(app, t.id);
      app.mirror.enqueueUpsert(app.db.getTicket(t.id)!);
      return;
    }

    // "Closed. Add a note?" — any staff reply within 10 minutes becomes the resolution note
    if (isStaff && t.status === "done" && t.closed_note_until && new Date(t.closed_note_until) > new Date() && text) {
      await actions.saveResolutionNote(app, t, text);
      await message.react("📝").catch(() => undefined);
      await postInThread(app, t, noteSaved());
      return;
    }

    // reporter replies within 24h of done -> reopen
    if (isReporter && t.status === "done" && t.closed_at && text) {
      const hours = (Date.now() - new Date(t.closed_at).getTime()) / 3600000;
      if (hours <= 24) await actions.reopen(app, t, text);
      else await postInThread(app, t, archivedReopenHint(ticketRef(t.id)));
      return;
    }
  } catch (err) {
    app.log.error({ err }, "thread message handler failed");
  }
}

export async function ingestPhotos(app: App, ticketId: number, message: Message, opts: { quiet?: boolean } = {}): Promise<void> {
  const t = app.db.getTicket(ticketId);
  if (!t) return;
  const existing = app.db.photos(ticketId).length;
  let slot = existing;
  let added = 0;
  for (const a of message.attachments.values()) {
    const type = (a.contentType ?? "").split(";")[0]!.trim();
    if (!app.cfg.photos.types.includes(type)) continue;
    if (a.size > app.cfg.photos.max_bytes) {
      await postInThread(app, t, `📸 That image is over ${Math.round(app.cfg.photos.max_bytes / 1048576)} MB — I couldn't save it to the board.`);
      continue;
    }
    if (slot >= app.cfg.photos.max_per_ticket) {
      await postInThread(app, t, `📸 I keep up to ${app.cfg.photos.max_per_ticket} photos per ticket — this one stays in the thread only.`);
      break;
    }
    try {
      const res = await fetch(a.url);
      if (!res.ok) throw new Error(`download ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const dir = path.join(app.env.PHOTO_DIR, String(ticketId));
      fs.mkdirSync(dir, { recursive: true });
      slot += 1;
      const local = path.join(dir, `${slot}.${EXT[type] ?? "bin"}`);
      fs.writeFileSync(local, buf);
      const photo = app.db.addPhoto({ ticket_id: ticketId, discord_url: a.url, local_path: local, content_type: type });
      app.mirror.enqueuePhoto(ticketId, photo.id);
      added++;
    } catch (err) {
      app.log.error({ err, ticket: ticketId }, "photo buffering failed");
    }
  }
  if (added) {
    if (!opts.quiet) await postInThread(app, t, `📸 Added to ${ticketRef(ticketId)}.`);
    await refreshSurfaces(app, ticketId);
    if (t.mirror_record_id === null) app.mirror.enqueueUpsert(t); // make sure the page exists for the upload
  }
  void displayNameOf;
}
