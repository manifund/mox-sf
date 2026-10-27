/**
 * Every user-facing string lives here (§6). Nothing is inlined at a call site.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CheckboxBuilder,
  EmbedBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import type { Category, Config, OwnerKey, Priority } from "./config.js";
import { ownerDisplay } from "./config.js";
import type { Photo, Status, Ticket } from "./db.js";
import { cid, ticketRef } from "./util/ids.js";
import { ageLong, ageShort, durationShort } from "./util/time.js";

// ─── vocab ──────────────────────────────────────────────────────────────────

export const PRIORITY_LABEL: Record<Priority, string> = {
  P0: "🔴 Urgent",
  P1: "🟠 Important",
  P2: "🟡 No rush",
  P3: "⚪ Idea",
};
export const PRIORITY_EMOJI: Record<Priority, string> = { P0: "🔴", P1: "🟠", P2: "🟡", P3: "⚪" };
export const PRIORITY_WORD: Record<Priority, string> = { P0: "Urgent", P1: "Important", P2: "No rush", P3: "Idea" };
export const PRIORITY_COLOR: Record<Priority, number> = { P0: 0xe5484d, P1: 0xf76b15, P2: 0xf0c000, P3: 0x9a9a9a };

export const CATEGORY_LABEL: Record<Category, string> = {
  safety: "Safety",
  door_codes: "Door codes",
  plumbing: "Plumbing",
  utilities: "Utilities",
  furniture: "Furniture",
  appliance: "Appliance",
  security: "Security",
  stocking: "Stocking",
  cleaning: "Cleaning",
  cosmetic: "Cosmetic",
  events: "Events",
  operations: "Operations",
  space: "Space",
  other: "Other",
};

export const STATUS_LABEL: Record<Status, string> = {
  new: "new",
  routed: "open",
  claimed: "being worked on",
  done: "fixed",
  "won't_do": "declined",
  duplicate: "merged",
  not_a_ticket: "redirected",
  logged: "on the ideas list",
};

export const EMERGENCY_LINE =
  "🚨 Fire, medical emergency, gas smell, active break-in → **call 911 first.** This bot is not an emergency line.";

export function threadUrl(cfg: Config, threadId: string): string {
  return `https://discord.com/channels/${cfg.guild_id}/${threadId}`;
}

export function mentionUsers(ids: string[]): string {
  return ids.map((id) => `<@${id}>`).join(" ");
}

export function mentionRole(id: string): string {
  return `<@&${id}>`;
}

function reporterMention(t: Ticket): string {
  return t.reporter_id ? `<@${t.reporter_id}>` : t.reporter_name;
}

// ─── §6.1 pinned post ───────────────────────────────────────────────────────

/** First message in the channel: how this works, from the member's point of view. No buttons. */
export function introPost(cfg: Config) {
  void cfg;
  const content = [
    "**🔧 Report an issue: how this works**",
    "",
    "This modal is for anything in the building that's **broken, missing, dirty, or unsafe**. Click the button below and it opens a private thread only you and staff can see. You'll get updates there until it's closed.",
    "",
    "**How it works**",
    "1. Tap **Report an issue** below.",
    "2. Say what's wrong and where (floor + room). Tick the box if it's urgent.",
    "3. A private thread opens. Only you and Mox staff can see it.",
    "4. Within a minute it's sorted and the right person is pinged. You'll see in the thread who picks it up and when it's done.",
    "5. Add a photo or more detail any time by replying in the thread. Photos get things fixed faster.",
    "6. Marked done but still broken? Reply in the thread within a day and it reopens.",
  ].join("\n");
  return { content };
}

/** Second message: the button. Pinned, and kept as the last thing in the channel. */
export function pinnedPost() {
  const content = "*Button not responding? The bot may be down. Tag @mox staff in #ask-staff and we'll log it for you.*";
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(cid("report", "private")).setLabel("Report an issue").setEmoji("🔧").setStyle(ButtonStyle.Primary),
  );
  return { content, components: [row] };
}

// ─── §6.2 modal ─────────────────────────────────────────────────────────────

export const MODAL_FIELDS = { what: "what", where: "where", context: "context", urgent: "urgent" } as const;

export function reportModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(cid("modal", "report"))
    .setTitle("Report a building issue")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("What's wrong, or what would you like?")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(MODAL_FIELDS.what)
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("The coffee machine in the 4th floor kitchen won't turn on")
            .setRequired(true)
            .setMaxLength(800),
        ),
      new LabelBuilder()
        .setLabel("Where is it?")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(MODAL_FIELDS.where)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("4th floor kitchen / Office 302")
            .setRequired(true)
            .setMaxLength(100),
        ),
      new LabelBuilder()
        .setLabel("Anything else we should know? (optional)")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(MODAL_FIELDS.context)
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Been like this since Monday. Tried the wall switch.")
            .setRequired(false)
            .setMaxLength(400),
        ),
      new LabelBuilder()
        .setLabel("This is urgent")
        .setDescription("Safety, active damage, a major outage, or many people blocked. Pings staff right now.")
        .setCheckboxComponent(new CheckboxBuilder().setCustomId(MODAL_FIELDS.urgent).setDefault(false)),
    );
}

export function wontDoModal(ticketId: number): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(cid("modal", "wontdo", ticketId))
    .setTitle(`Won't do: ${ticketRef(ticketId)}`)
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Why not? The reporter will see this.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("reason")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Out of scope for the building team. Try the landlord's portal.")
            .setRequired(true)
            .setMaxLength(400),
        ),
    );
}

// ─── §6.3 first message in the thread ───────────────────────────────────────

/** The first line of a ticket thread. The staff card right after it carries everything else. */
export function threadOpening(t: Ticket) {
  const lines = [
    `Thanks ${reporterMention(t)}, this is **${ticketRef(t.id)}**.`,
    "",
    "📸 **Drop a photo here if you can.** It's the single biggest thing that gets something fixed faster.",
    "",
    "🔒 Everyone on the Mox staff team can see this thread. No other members can.",
  ];
  return { content: lines.join("\n"), components: [] as ActionRowBuilder<MessageActionRowComponentBuilder>[] };
}

export const safetyFastPathNote = (owner: string) =>
  `⚠️ This reads as a **safety** issue, so I've routed it as 🔴 Urgent to ${owner} straight away. No need to pick a priority.`;


// ─── §6.4 staff card ────────────────────────────────────────────────────────

export interface CardOptions {
  cfg: Config;
  ticket: Ticket;
  photos: Photo[];
  mentionUserIds: string[];
  mentionRoleId: string | null;
  /** include an "Open thread" link (channel / mirror surfaces) */
  withThreadLink: boolean;
  /** attach the first photo as a thumbnail via attachment:// */
  thumbnailAttachmentName?: string;
}

export function cardTitle(t: Ticket): string {
  const p = t.priority ?? "P1";
  return `${ticketRef(t.id)} · ${PRIORITY_LABEL[p]}`;
}

function cardFooter(t: Ticket, cfg: Config): string | null {
  if (t.status === "claimed" && t.claimed_by) return `👀 ${t.claimed_by}`;
  if (t.status === "done") return `✅ ${t.closed_by ?? "closed"} · ${durationShort(t.routed_at ?? t.created_at, t.closed_at ?? t.updated_at)}`;
  if (t.reopen_count > 0 && t.status === "routed") return `🔁 Reopened ×${t.reopen_count}`;
  void cfg;
  return null;
}

export function staffCard(o: CardOptions) {
  const { cfg, ticket: t } = o;
  const p = t.priority ?? "P1";
  const forLine = o.mentionRoleId
    ? mentionRole(o.mentionRoleId)
    : o.mentionUserIds.length
      ? mentionUsers(o.mentionUserIds)
      : `**${ownerDisplay(cfg, t.owner_key)}**`;

  const lines: string[] = [];
  lines.push(t.staff_summary ?? t.description.slice(0, 200));
  lines.push("");
  lines.push(`**Where** ${t.location}`);
  lines.push(`**Reported by** ${reporterMention(t)} · ${ageLong(t.created_at)}`);
  lines.push(`**Category** ${t.category ? CATEGORY_LABEL[t.category] : "n/a"}${t.triage_method === "keywords" ? " *(keyword triage)*" : ""}`);
  lines.push(`**For** ${forLine}`);
  if (t.reported_priority && t.assessed_priority && t.reported_priority !== t.assessed_priority) {
    if (t.priority_source === "ai_escalation")
      lines.push(`⚠️ Reported ${PRIORITY_WORD[t.reported_priority]} · escalated to ${PRIORITY_WORD[t.assessed_priority]}${t.triage_reasoning ? `: ${t.triage_reasoning}` : ""}`);
    else lines.push(`⚠️ Reported ${PRIORITY_WORD[t.reported_priority]} · AI assessed ${PRIORITY_WORD[t.assessed_priority]}`);
  }
  if (t.priority_source === "safety") lines.push("🚨 Safety: routed before a priority was picked.");
  if (t.routed_by === "ai_judgment") lines.push(`🤔 Sent to ${ownerDisplay(cfg, t.owner_key)}: ${t.owner_reasoning ?? "the category didn't settle it"}`);
  if (t.reopen_count > 0 && t.status === "routed") lines.push(`🔁 Reopened by the reporter.`);
  if (o.photos.length) lines.push(`📸 ${o.photos.length} photo${o.photos.length === 1 ? "" : "s"} in the thread`);
  lines.push("");
  lines.push("👀 I'm on it   ✅ Done");

  const embed = new EmbedBuilder().setTitle(cardTitle(t)).setColor(PRIORITY_COLOR[p]).setDescription(lines.join("\n").slice(0, 4000));
  const footer = cardFooter(t, cfg);
  if (footer) embed.setFooter({ text: footer });
  if (o.thumbnailAttachmentName) embed.setThumbnail(`attachment://${o.thumbnailAttachmentName}`);

  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(cid("staff", "reassign", t.id)).setLabel("Reassign").setEmoji("↪️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(cid("staff", "wontdo", t.id)).setLabel("Won't do").setEmoji("🚫").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(cid("staff", "priority", t.id)).setLabel("Priority").setEmoji("⚙️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(cid("staff", "notticket", t.id)).setLabel("Not a ticket").setEmoji("❓").setStyle(ButtonStyle.Secondary),
  );
  const rows = [row1];
  if (o.withThreadLink && t.thread_id) {
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setLabel(`Reply to ${t.reporter_name}`).setEmoji("💬").setStyle(ButtonStyle.Link).setURL(threadUrl(cfg, t.thread_id)),
      ),
    );
  }

  // mentions have to be in `content` to actually ping
  const content = o.mentionRoleId ? mentionRole(o.mentionRoleId) : o.mentionUserIds.length ? mentionUsers(o.mentionUserIds) : "";
  return { content, embeds: [embed], components: rows };
}

/** §6.4.1: eight lines become one. */
export function collapsedCard(cfg: Config, t: Ticket): string {
  const title = t.title ?? t.description.slice(0, 60);
  const link = t.thread_id ? ` · [thread ↗](${threadUrl(cfg, t.thread_id)})` : "";
  switch (t.status) {
    case "done":
      return `~~${ticketRef(t.id)} · ${title}~~ ✅ ${t.closed_by ?? ""} · ${durationShort(t.routed_at ?? t.created_at, t.closed_at ?? t.updated_at)}${link}`;
    case "won't_do":
      return `~~${ticketRef(t.id)} · ${title}~~ 🚫 Won't do: ${t.wont_do_reason ?? ""}${link}`;
    case "duplicate":
      return `~~${ticketRef(t.id)} · ${title}~~ 🔗 merged into ${t.duplicate_of ? ticketRef(t.duplicate_of) : "another ticket"}${link}`;
    case "not_a_ticket":
      return `~~${ticketRef(t.id)} · ${title}~~ ❓ not a ticket, asked in channel${link}`;
    default:
      return `~~${ticketRef(t.id)} · ${title}~~${link}`;
  }
}

export const movedToIdeasMarker = (cfg: Config, t: Ticket, by: string) =>
  `~~${ticketRef(t.id)} · ${t.title ?? t.description.slice(0, 60)}~~ 💡 moved to the ideas list by ${by}${t.thread_id ? ` · [thread ↗](${threadUrl(cfg, t.thread_id)})` : ""}`;

export const reassignedMarker = (cfg: Config, t: Ticket, toKey: OwnerKey) =>
  `↪️ ${ticketRef(t.id)} reassigned to **${ownerDisplay(cfg, toKey)}**${t.thread_id ? ` · [thread ↗](${threadUrl(cfg, t.thread_id)})` : ""}`;

// ─── staff selects ──────────────────────────────────────────────────────────

export function reassignSelect(cfg: Config, t: Ticket) {
  const rota = cfg.rota.facilities;
  const otherHalf = t.owner_key && rota.includes(t.owner_key) ? rota.filter((k) => k !== t.owner_key) : [];
  const order: OwnerKey[] = [...otherHalf, ...(["jake", "whit", "carolina", "robin", "claudio", "contractors", "all_staff"] as OwnerKey[])];
  const seen = new Set<OwnerKey>();
  const options = order
    .filter((k) => cfg.owners[k] && !seen.has(k) && (seen.add(k), true))
    .map((k) => ({ label: cfg.owners[k]!.display_name, value: k, default: false }));
  const select = new StringSelectMenuBuilder().setCustomId(cid("sel", "reassign", t.id)).setPlaceholder("Reassign to…").addOptions(options);
  return {
    content: `Who should own **${ticketRef(t.id)}**? Currently **${ownerDisplay(cfg, t.owner_key)}**.`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  };
}

export function prioritySelect(t: Ticket) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(cid("sel", "priority", t.id))
    .setPlaceholder("Set priority…")
    .addOptions(
      { label: "Urgent", value: "P0", emoji: "🔴", description: "Safety, active damage, major outage, many people blocked" },
      { label: "Important", value: "P1", emoji: "🟠", description: "Broken and needed, but there's a way around it" },
      { label: "No rush", value: "P2", emoji: "🟡", description: "Should get done, whenever" },
    );
  return {
    content: `Set the priority for **${ticketRef(t.id)}** (currently ${t.priority ? PRIORITY_LABEL[t.priority] : "unset"}).`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  };
}

// ─── reporter thread updates (G5) ───────────────────────────────────────────

export function reporterRouted(cfg: Config, t: Ticket, opts: { channelBased: boolean }) {
  const owner = ownerDisplay(cfg, t.owner_key);
  const p = t.priority ?? "P1";
  const where = `**${owner}** has been pinged`;
  void opts;
  const lines = [
    `📬 Logged as **${PRIORITY_LABEL[p]}** · *${t.category ? CATEGORY_LABEL[t.category] : "Other"}*. ${where}.`,
  ];
  if (t.priority_source === "ai_escalation" && t.reported_priority)
    lines.push(`I bumped this from ${PRIORITY_WORD[t.reported_priority]} to ${PRIORITY_WORD[p]}${t.triage_reasoning ? `: ${t.triage_reasoning}` : ""}.`);
  if (t.routed_by === "ai_judgment" && t.owner_reasoning) lines.push(`*Why ${owner}:* ${t.owner_reasoning}`);
  lines.push(`You'll hear from me here when someone picks it up and when it's done. Type \`bump\` if the priority looks wrong.`);
  return lines.join("\n");
}

export const reporterClaimed = (who: string) => `👀 **${who}** is on it.`;
export const reporterUnclaimed = (who: string) => `${who} stepped back. This is open again and still in the queue.`;
export const reporterDone = (who: string, note: string | null) =>
  `✅ **${who}** marked this done${note ? `: ${note}` : ""}. Reply here within 24h if it's still broken and I'll reopen it.`;
export const reporterDoneNote = (note: string) => `📝 Note from staff: ${note}`;
export const reporterWontDo = (who: string, reason: string) => `🚫 **${who}** closed this as won't do: ${reason}`;
export const reporterReassigned = (cfg: Config, toKey: OwnerKey) => `↪️ Now with **${ownerDisplay(cfg, toKey)}**.`;
export const reporterPriorityChanged = (from: Priority | null, to: Priority, by: string) =>
  `⚙️ Priority changed ${from ? `from ${PRIORITY_WORD[from]} ` : ""}to **${PRIORITY_WORD[to]}** by ${by}.`;
export const reporterReopened = (claimant: string | null) =>
  `🔁 Reopened. Thanks for flagging it.${claimant ? ` ${claimant}, this one's back.` : ""}`;
export const reporterMerged = (into: number) =>
  `🔗 Linked to **${ticketRef(into)}**. You'll get a message here when it's fixed. Closing this thread.`;
export const watcherClosed = (ref: string, note: string | null) =>
  `✅ **${ref}**, which you also reported, has been marked done${note ? `: ${note}` : ""}.`;
export const closedAddNote = () => "Closed. Add a note? Any reply here in the next 10 minutes becomes the resolution note.";
export const noteSaved = () => "📝 Saved as the resolution note.";
export const bumpAck = () => "Flagged. Staff can change the priority from the card. If nothing happens, reply here.";
export const bumpStaffNotice = (who: string) => `🔔 ${who} bumped this. Is the priority right?`;
export const archivedReopenHint = (ref: string) =>
  `${ref} was closed more than a day ago, so this thread is read-only. Please open a new report from the pinned buttons. I'll link the two.`;

// ─── §6.5 duplicate offer ───────────────────────────────────────────────────

export function duplicateOffer(t: Ticket, other: Ticket) {
  const content =
    `Heads up: this looks like **${ticketRef(other.id)}**, which is already reported and currently **${STATUS_LABEL[other.status]}**.\n` +
    `Want me to link them so you get the update when it's fixed?`;
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(cid("dupe", "yes", t.id)).setLabel("Yes, same issue").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(cid("dupe", "no", t.id)).setLabel("No, this is different").setStyle(ButtonStyle.Secondary),
  );
  return { content, components: [row] };
}

// ─── §6.6 question redirect ─────────────────────────────────────────────────

export function questionRedirect(t: Ticket) {
  const content =
    "Quick check: this reads more like a question than something that's broken.\n" +
    "Questions do better posted straight in the channel, where more people see them. Was this meant as a building issue?";
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(cid("q", "issue", t.id)).setLabel("Yes, something's broken").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(cid("q", "ask", t.id)).setLabel("No, I'll just ask in the channel").setStyle(ButtonStyle.Secondary),
  );
  return { content, components: [row] };
}
export const questionRedirected = () => "No problem. Post it in the channel and staff will answer there. Closing this thread; nothing was logged.";
export const questionKeptAsIssue = () => "Got it, treating this as a building issue.";
export const notATicketByStaff = (who: string) => `❓ ${who} marked this as a question rather than a building issue. Just ask it in the channel. Closing this thread.`;

// ─── §6.7 idea ──────────────────────────────────────────────────────────────

export const ideaAck = (id: number) =>
  `Thanks! We've added this to the queue as **${ticketRef(id)}** and will try to address it when we can.`;

// ─── chat intake (#ask-staff) ────────────────────────────────────────────────

export const chatIntakeReply = (t: Ticket) =>
  `Logged this as **${ticketRef(t.id)}** so it doesn't get lost${t.thread_id ? `: <#${t.thread_id}>` : "."}` +
  ` You'll get updates there. Nothing else to fill in.`;
export const chatIntakeIdeaReply = (t: Ticket) =>
  `Thanks! We've added this to the queue as **${ticketRef(t.id)}** and will try to address it when we can.`;
export const chatIntakeUndone = (ref: string) => `↩️ ${ref} undone. Not a ticket.`;
export const chatIntakeTagHelp = (cfg: Config) =>
  `Tag me on a message that describes the problem, or reply to someone's message with the tag and I'll log that one. For anything else, the button in <#${cfg.channels.report_an_issue}> is fastest.`;
export const chatIntakeNotAnIssue = (cfg: Config) =>
  `I didn't read that as a building problem or a wish for the building, so I haven't logged it. If it is one, the button in <#${cfg.channels.report_an_issue}> will take it.`;
export const chatIntakeMissingLocation = () => "Where is it? Floor and room, if you can. Reply here and I'll add it.";

// ─── §6.8 /log ──────────────────────────────────────────────────────────────

export const logReply = (id: number, weekCount: number) => `Logged **${ticketRef(id)}**. That's ${weekCount} this week.`;

// ─── nudges & ops (§7.5.2, §9.1, §9.2) ─────────────────────────────────────

export const nudgeP0Card = (roleId: string, id: number) => `${mentionRole(roleId)}, ${ticketRef(id)} hasn't been picked up`;
export const nudgeP1Card = (userIds: string[], id: number) => `${mentionUsers(userIds)}, ${ticketRef(id)} hasn't been picked up yet`;
export const nudgeDM = (cfg: Config, t: Ticket) =>
  `${PRIORITY_EMOJI[t.priority ?? "P1"]} **${ticketRef(t.id)}**: ${t.title ?? t.description.slice(0, 80)} (${t.location}) hasn't been picked up. ` +
  `React 👀 on the card when you're on it.${t.thread_id ? `\n${threadUrl(cfg, t.thread_id)}` : ""}`;

export const opsMirrorFailed = (id: number, err: string) =>
  `Airtable write for ${ticketRef(id)} failed 8×: ${err}. Run /mox resync ${id} when Airtable is back.`;
export const opsMirrorBacklog = (n: number) => `Airtable queue backing up (${n} pending).`;
export const opsKeywordFallback = () => "Haiku triage has fallen back to keywords 5× in a row. Check the Anthropic key or quota.";
export const opsOnline = (ver: string) => `Mox Support Bot online (v${ver}).`;

// ─── §9.4 standing queue ────────────────────────────────────────────────────

export function standingQueue(cfg: Config, open: Ticket[], closedToday: number, ideas: number, maxRows: number): string {
  const now = new Date();
  const line = (t: Ticket) => {
    const claim = t.status === "claimed" ? `👀 ${t.claimed_by ?? ""}` : "unclaimed";
    return `${PRIORITY_EMOJI[t.priority ?? "P1"]} ${ticketRef(t.id)}  ${t.title ?? t.description.slice(0, 50)} · ${ageShort(t.created_at, now)} · ${claim}`;
  };
  const urgent = open.filter((t) => t.priority === "P0");
  const rest = open.filter((t) => t.priority !== "P0");
  const parts: string[] = [`📋 **Open right now** · ${open.length} ticket${open.length === 1 ? "" : "s"} · updated <t:${Math.floor(now.getTime() / 1000)}:R>`, ""];
  let rows = 0;
  let truncated = 0;
  if (urgent.length) {
    parts.push("**🔴 Urgent**");
    for (const t of urgent) {
      const owner = t.owner_key === "all_staff" ? mentionRole(cfg.roles.mox_staff) : ownerDisplay(cfg, t.owner_key);
      parts.push(`${line(t)} · ${owner}`);
      rows++;
    }
    parts.push("");
  }
  const byOwner = new Map<string, Ticket[]>();
  for (const t of rest) {
    const k = t.owner_key ?? "unassigned";
    byOwner.set(k, [...(byOwner.get(k) ?? []), t]);
  }
  const ownerOrder: string[] = ["jake", "whit", "carolina", "robin", "claudio", "contractors", "all_staff", "unassigned"];
  for (const k of [...ownerOrder, ...[...byOwner.keys()].filter((k) => !ownerOrder.includes(k))]) {
    const list = byOwner.get(k);
    if (!list?.length) continue;
    parts.push(`**${ownerDisplay(cfg, k)}: ${list.length}**`);
    // urgent first, then by priority, oldest first; truncate the oldest P2s when over budget
    const sorted = [...list].sort((a, b) => (a.priority ?? "P1").localeCompare(b.priority ?? "P1") || a.id - b.id);
    for (const t of sorted) {
      if (rows >= maxRows) {
        truncated++;
        continue;
      }
      parts.push(line(t));
      rows++;
    }
    parts.push("");
  }
  if (truncated) parts.push(`+ ${truncated} more on the board ↗`, "");
  parts.push("─────");
  const board = cfg.airtable.board_url ? ` · [Open the board ↗](${cfg.airtable.board_url})` : "";
  parts.push(`✅ ${closedToday} closed today · 💡 ${ideas} idea${ideas === 1 ? "" : "s"} on the board${board}`);
  let text = parts.join("\n");
  if (text.length > 3900) text = text.slice(0, 3850) + "\n+ more on the board ↗";
  return text;
}

// ─── issue digest (reactable) ───────────────────────────────────────────────

/** Digests skim: a short faithful summary when we have one, else the reporter's first sentence. */
export const digestTitle = (t: Ticket) => t.digest_summary ?? t.title ?? t.description.slice(0, 80);

/** One open work item in a digest. Staff react 👀 / ✅ right on this line. Closed: the collapsed line. */
export function digestItemLine(cfg: Config, t: Ticket): string {
  if (CLOSED_STATUSES_RENDER.includes(t.status)) return collapsedCard(cfg, { ...t, title: digestTitle(t) });
  if (t.status === "logged") return `~~${ticketRef(t.id)} · ${digestTitle(t)}~~ 💡 moved to the ideas list`;
  const bits = [
    `${PRIORITY_EMOJI[t.priority ?? "P1"]} **${ticketRef(t.id)}** · ${digestTitle(t)}`,
    ...(t.location && t.location !== "Not stated" ? [`📍 ${t.location}`] : []),
    `for ${ownerDisplay(cfg, t.owner_key)}`,
    t.status === "claimed" ? `👀 ${t.claimed_by ?? "claimed"}` : "unclaimed",
    `opened ${ageShort(t.created_at)} ago`,
  ];
  const link = t.thread_id ? ` · [thread ↗](${threadUrl(cfg, t.thread_id)})` : t.source_message_url ? ` · [message ↗](${t.source_message_url})` : "";
  return `${bits.join(" · ")}${link}`;
}
const CLOSED_STATUSES_RENDER: Status[] = ["done", "won't_do", "duplicate", "not_a_ticket"];

export function digestHeader(dayLabel: string, counts: { open: number; closed: number; ideas: number }): string {
  return [
    `## 📋 Issue digest · ${dayLabel}`,
    `**${counts.open} open work item${counts.open === 1 ? "" : "s"}** · **${counts.closed} closed today** · **${counts.ideas} idea${counts.ideas === 1 ? "" : "s"}** today`,
    "",
    counts.open
      ? "**🔧 Open work items.** Each is its own message below: **react 👀 to claim it, ✅ when it's done.** The line updates itself as the ticket changes."
      : "**🔧 Open work items.** Nothing open. 🎉",
  ].join("\n");
}

/** Closed work and ideas as plain lists, split into chunks that fit a Discord message. */
export function digestLists(cfg: Config, closed: Ticket[], ideas: Ticket[]): string[] {
  const lines: string[] = [];
  lines.push(`**✅ Closed today · ${closed.length}**`);
  if (!closed.length) lines.push("Nothing closed yet today.");
  for (const t of closed) {
    const how =
      t.status === "done"
        ? `✅ ${t.closed_by ?? "done"}${t.resolution_note ? `: ${t.resolution_note}` : ""}`
        : t.status === "duplicate"
          ? `🔗 merged into ${t.duplicate_of ? ticketRef(t.duplicate_of) : "another ticket"}`
          : `🚫 won't do${t.wont_do_reason ? `: ${t.wont_do_reason}` : ""}`;
    lines.push(`• **${ticketRef(t.id)}** · ${digestTitle(t)} · ${how}`);
  }
  lines.push("", `**💡 Ideas and nice-to-haves · ${ideas.length}**`);
  if (!ideas.length) lines.push("No new ideas today.");
  for (const t of ideas) {
    const link = t.source_message_url ? ` · [message ↗](${t.source_message_url})` : "";
    lines.push(`• **${ticketRef(t.id)}** · ${digestTitle(t)} · from ${t.reporter_name}${link}`);
  }
  if (cfg.airtable.board_url) lines.push("", `Everything is on the board: <${cfg.airtable.board_url}>`);
  // chunk under Discord's 2000-character limit, breaking only between lines
  const chunks: string[] = [];
  let cur = "";
  for (const l of lines) {
    if (cur && cur.length + l.length + 1 > 1900) {
      chunks.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n${l}` : l;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// ─── §9.3 weekly digest ─────────────────────────────────────────────────────

export interface DigestData {
  weekLabel: string;
  closed: Ticket[];
  closedRecap: string | null;
  byOwner: Record<string, number>;
  viaLog: number;
  medianClose: string | null;
  open: Ticket[];
  ideasNew: number;
  ideasTotal: number;
  ideasOldestAge: string | null;
  signals: {
    p0Rate: number | null;
    disagreements: number;
    overrides: number;
    keywordFallbacks: number;
    aiJudgment: number;
    duplicates: number;
    chatIntake: number;
    chatUndone: number;
  };
}

export function weeklyDigest(cfg: Config, d: DigestData): string {
  const now = new Date();
  const lines: string[] = [`**Mox building support · week of ${d.weekLabel}**`, ""];
  lines.push(`**✅ Closed: ${d.closed.length}**`);
  if (d.closedRecap) lines.push(d.closedRecap.trim());
  else if (d.closed.length) lines.push(`${d.closed.length} ticket${d.closed.length === 1 ? "" : "s"} closed this week.`);
  else lines.push("Nothing closed this week.");
  const ownerBits = Object.entries(d.byOwner)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${ownerDisplay(cfg, k)} ${n}`);
  if (d.viaLog) ownerBits.push(`via /log ${d.viaLog}`);
  if (ownerBits.length) lines.push(ownerBits.join(" · "));
  if (d.medianClose) lines.push(`Median time to close: ${d.medianClose}`);
  lines.push("");
  lines.push(`**🔧 Still open: ${d.open.length}**`);
  for (const t of d.open) {
    const days = (now.getTime() - new Date(t.created_at).getTime()) / 86400000;
    const stale = days >= 7 ? " ⚠️" : "";
    const claim = t.status === "claimed" ? `👀 ${t.claimed_by ?? ""}` : "unclaimed";
    lines.push(`${PRIORITY_EMOJI[t.priority ?? "P1"]} ${ticketRef(t.id)}  ${digestTitle(t)} · ${ageShort(t.created_at, now)}${stale} · ${claim} · ${ownerDisplay(cfg, t.owner_key)}`);
  }
  if (!d.open.length) lines.push("Nothing open. 🎉");
  lines.push("");
  lines.push(`**💡 Ideas: ${d.ideasNew} new, ${d.ideasTotal} on the list**`);
  lines.push(
    cfg.digest.ideas_reviewer
      ? `${cfg.digest.ideas_reviewer} reviews this list.${d.ideasOldestAge ? ` Oldest has been sitting ${d.ideasOldestAge}.` : ""}`
      : `Nobody owns this list.${d.ideasOldestAge ? ` Oldest has been sitting ${d.ideasOldestAge}.` : ""}`,
  );
  lines.push("");
  lines.push("**Signals**");
  const s = d.signals;
  lines.push(
    `· P0 rate ${s.p0Rate === null ? "n/a" : `${Math.round(s.p0Rate * 100)}%`} · reporter/AI disagreed ${s.disagreements}× · staff override ${s.overrides}× · keyword fallback ${s.keywordFallbacks}×`,
  );
  lines.push(`· routed by AI judgment ${s.aiJudgment}× · duplicates caught ${s.duplicates}× · picked up from chat ${s.chatIntake} (${s.chatUndone} undone)`);
  return lines.join("\n").slice(0, 3990);
}

export const DIGEST_RECAP_SYSTEM = (maxBullets: number) =>
  `You write the "what got done" recap for a coworking-space building team's weekly Discord digest. ` +
  `Input: the week's closed tickets, one per line. Output: exactly one plain sentence summarising the week, then at most ${maxBullets} bullets ` +
  `(each starting with "· ") that GROUP the work by theme; never list tickets one by one, never include ticket numbers. ` +
  `If fewer than ${maxBullets} themes exist, use fewer. Warm, concrete, written for the people who did the work. No headings, no markdown other than the bullets.`;
