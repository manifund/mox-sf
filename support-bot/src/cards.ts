/**
 * Staff cards on every surface a ticket touches (§6.4, §7.5.1).
 * A state change updates SQLite, then edits every row in ticket_surfaces, then
 * rebuilds the standing queue.
 */
import { AttachmentBuilder, type Message, type MessageEditOptions } from "discord.js";
import fs from "node:fs";
import path from "node:path";
import type { App } from "./app.js";
import { CLOSED_STATUSES, type Surface, type Ticket } from "./db.js";
import { fetchMessage, fetchSendable, warnInaccessibleOnce } from "./discord.js";
import { collapsedCard, digestItemLine, reassignedMarker, staffCard } from "./render.js";
import { deliveryPlan } from "./routing.js";
import type { OwnerKey } from "./config.js";

function thumbnail(app: App, t: Ticket): { file: AttachmentBuilder; name: string } | null {
  const first = app.db.photos(t.id)[0];
  if (!first || !fs.existsSync(first.local_path)) return null;
  const name = `photo${path.extname(first.local_path)}`;
  return { file: new AttachmentBuilder(first.local_path, { name }), name };
}

function cardPayload(app: App, t: Ticket, withThreadLink: boolean, allowThumb: boolean) {
  const plan = deliveryPlan(app.cfg, t.owner_key ?? "unassigned", t.priority ?? "P1");
  const thumb = allowThumb ? thumbnail(app, t) : null;
  const card = staffCard({
    cfg: app.cfg,
    ticket: t,
    photos: app.db.photos(t.id),
    mentionUserIds: plan.mentionUserIds,
    mentionRoleId: plan.mentionRoleId,
    withThreadLink,
    thumbnailAttachmentName: thumb?.name,
  });
  return {
    content: card.content,
    embeds: card.embeds,
    components: card.components,
    files: thumb ? [thumb.file] : [],
    allowedMentions: { users: plan.mentionUserIds, roles: plan.mentionRoleId ? [plan.mentionRoleId] : [] },
  };
}

/** The canonical card, inside the ticket thread. */
export async function postThreadCard(app: App, t: Ticket): Promise<Ticket> {
  if (!t.thread_id) return t;
  const thread = await fetchSendable(app.client, t.thread_id);
  if (!thread) return t;
  // no pre-added 👀/✅: a reporter seeing "1" thought someone had claimed it. Staff react themselves.
  const msg = await thread.send(cardPayload(app, t, false, true));
  app.db.addSurface({ ticket_id: t.id, kind: "thread", channel_id: t.thread_id, message_id: msg.id });
  return app.db.updateTicket(t.id, { card_channel_id: t.thread_id, card_message_id: msg.id });
}

/** A second card in a team channel (P0 breakout or channel-based owner). */
export async function postChannelCard(app: App, t: Ticket, channelId: string): Promise<void> {
  const ch = await fetchSendable(app.client, channelId);
  if (!ch) {
    // the thread card already carries the @mentions, so the ticket is still delivered
    warnInaccessibleOnce(channelId, `channel card for ${t.id}`);
    return;
  }
  const msg = await ch.send(cardPayload(app, t, true, false));
  app.db.addSurface({ ticket_id: t.id, kind: "channel", channel_id: channelId, message_id: msg.id });
}

/** Post whatever §7.5 says this ticket needs beyond the thread card. */
export async function deliver(app: App, t: Ticket): Promise<void> {
  const plan = deliveryPlan(app.cfg, t.owner_key ?? "unassigned", t.priority ?? "P1");
  if (!plan.channelId) return;
  // never post the same channel card twice (e.g. re-route after a priority bump into the same channel)
  const already = app.db.surfaces(t.id).some((s) => s.kind === "channel" && s.channel_id === plan.channelId);
  if (already) return;
  await postChannelCard(app, t, plan.channelId);
}

/** Edit every recorded surface to match SQLite. Closed tickets collapse to one line (§6.4.1). */
export async function refreshSurfaces(app: App, ticketId: number): Promise<void> {
  const t = app.db.getTicket(ticketId);
  if (!t) return;
  const closed = CLOSED_STATUSES.includes(t.status) || t.status === "not_a_ticket";
  for (const s of app.db.surfaces(t.id)) {
    try {
      if (s.kind === "mirror") continue; // legacy rows from before public tickets were removed
      const msg = await fetchMessage(app.client, s.channel_id, s.message_id);
      if (!msg) {
        app.db.removeSurface(s.message_id);
        continue;
      }
      if (s.kind === "digest") {
        await msg.edit({ content: digestItemLine(app.cfg, t), embeds: [], components: [], allowedMentions: { parse: [] } });
        continue;
      }
      if (closed) {
        const edit: MessageEditOptions = { content: collapsedCard(app.cfg, t), embeds: [], components: [], attachments: [], allowedMentions: { parse: [] } };
        await msg.edit(edit);
      } else {
        const payload = cardPayload(app, t, s.kind === "channel", s.kind === "thread");
        // editing never re-pings; mentions stay visible as text
        // attachments: [] drops the previous thumbnail copy before the fresh one attaches
        await msg.edit({ ...payload, attachments: [], allowedMentions: { parse: [] } });
      }
    } catch (err) {
      app.log.warn({ err, ticket: t.id, surface: s }, "surface refresh failed");
    }
  }
  app.queue.schedule();
}

/** On reassign: old channel cards become a one-line marker and are forgotten; the thread card is refreshed. */
export async function retireChannelCards(app: App, t: Ticket, toKey: OwnerKey): Promise<void> {
  for (const s of app.db.surfaces(t.id).filter((x) => x.kind === "channel")) {
    try {
      const msg = await fetchMessage(app.client, s.channel_id, s.message_id);
      if (msg) await msg.edit({ content: reassignedMarker(app.cfg, t, toKey), embeds: [], components: [], attachments: [], allowedMentions: { parse: [] } });
    } catch (err) {
      app.log.warn({ err, surface: s }, "retire card failed");
    }
    app.db.removeSurface(s.message_id);
  }
}

export function isCardSurface(s: Surface): boolean {
  return s.kind === "thread" || s.kind === "channel";
}
