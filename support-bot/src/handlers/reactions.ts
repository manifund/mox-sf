/** 👀 / ✅ on staff cards (§6.4). Reactions are the fast path. */
import { Events, type MessageReaction, type PartialMessageReaction, type PartialUser, type User } from "discord.js";
import type { App } from "../app.js";
import * as actions from "../core/actions.js";
import { displayNameOf, isStaffUser } from "../discord.js";

const CLAIM = "👀";
const DONE = "✅";

export function registerReactions(app: App): void {
  app.client.on(Events.MessageReactionAdd, (r, u) => void handle(app, r, u, "add"));
  app.client.on(Events.MessageReactionRemove, (r, u) => void handle(app, r, u, "remove"));
}

async function handle(app: App, reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser, dir: "add" | "remove"): Promise<void> {
  try {
    if (user.id === app.client.user.id) return;
    const emoji = reaction.emoji.name;
    if (emoji !== CLAIM && emoji !== DONE) return;
    if (reaction.partial) await reaction.fetch();
    const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;

    const t = app.db.getTicketByMessage(message.id);
    if (!t) return;
    const surface = app.db.surfaces(t.id).find((s) => s.message_id === message.id);
    if (surface?.kind === "mirror") return; // legacy surface from before public tickets were removed

    const isStaff = await isStaffUser(app.client, app.cfg, user.id);
    if (!isStaff) {
      // non-staff reactions are ignored and removed so 👀/✅ stay a staff-only signal
      if (dir === "add") {
        try {
          await reaction.users.remove(user.id);
        } catch {
          /* missing Manage Messages */
        }
      }
      return;
    }

    const actor = { id: user.id, name: await displayNameOf(app.client, app.cfg, user.id) };
    const fresh = app.db.getTicket(t.id)!;

    if (emoji === CLAIM && dir === "add") return void (await actions.claim(app, fresh, actor));
    if (emoji === CLAIM && dir === "remove") {
      // only counts as stepping back if nobody has ✅'d and the remover is the claimant
      if (fresh.status === "claimed" && fresh.claimed_by === actor.name) await actions.unclaim(app, fresh, actor);
      return;
    }
    if (emoji === DONE && dir === "add") return void (await actions.close(app, fresh, actor));
    if (emoji === DONE && dir === "remove") return void (await actions.undoClose(app, fresh, actor));
  } catch (err) {
    app.log.error({ err }, "reaction handler failed");
  }
}
