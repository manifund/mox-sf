/** Small Discord helpers shared by handlers and jobs. */
import {
  ChannelType,
  DiscordAPIError,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  type Client,
  type GuildMember,
  type Message,
  type TextBasedChannel,
  type ThreadChannel,
} from "discord.js";
import type { Config } from "./config.js";
import { log } from "./log.js";

/**
 * Channels the bot has been configured for but cannot see. Running with only
 * #report-an-issue is a supported mode: tickets still work because every card is
 * posted in its thread with the owner @-mentioned. Warn once per channel, not per attempt.
 */
const inaccessible = new Set<string>();
export function warnInaccessibleOnce(channelId: string, what: string): void {
  if (inaccessible.has(channelId)) return;
  inaccessible.add(channelId);
  log.warn({ channelId, what }, "channel not accessible — skipping (give support-bot View Channel to enable)");
}
export function isKnownInaccessible(channelId: string): boolean {
  return inaccessible.has(channelId);
}

export type SendableChannel = Extract<TextBasedChannel, { send: unknown }>;

/**
 * A channel the bot can actually post in. Discord hands bots the channel object even when
 * they lack View Channel, so existence is not enough — check effective permissions.
 */
export async function fetchSendable(client: Client, channelId: string): Promise<SendableChannel | null> {
  try {
    const ch = await client.channels.fetch(channelId);
    if (!ch || !ch.isTextBased() || !("send" in ch)) return null;
    if ("guild" in ch && ch.guild && "permissionsFor" in ch) {
      const me = ch.guild.members.me ?? (await ch.guild.members.fetchMe());
      const perms = ch.permissionsFor(me);
      const needed = ch.isThread() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages;
      if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms.has(needed)) return null;
    }
    return ch as SendableChannel;
  } catch {
    return null;
  }
}

export async function fetchThread(client: Client, threadId: string): Promise<ThreadChannel | null> {
  try {
    const ch = await client.channels.fetch(threadId);
    if (!ch || !ch.isThread()) return null;
    return ch;
  } catch {
    return null;
  }
}

/** Returns null when the message is gone (deleted) so callers can drop the surface. */
export async function fetchMessage(client: Client, channelId: string, messageId: string): Promise<Message | null> {
  const ch = await fetchSendable(client, channelId);
  if (!ch) return null;
  try {
    return await ch.messages.fetch(messageId);
  } catch (err) {
    if (err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.UnknownMessage) return null;
    throw err;
  }
}

export function isStaffMember(cfg: Config, member: GuildMember | null | undefined): boolean {
  if (!member) return false;
  return member.roles.cache.has(cfg.roles.mox_staff);
}

export async function isStaffUser(client: Client, cfg: Config, userId: string): Promise<boolean> {
  try {
    const guild = await client.guilds.fetch(cfg.guild_id);
    const member = await guild.members.fetch(userId);
    return isStaffMember(cfg, member);
  } catch {
    return false;
  }
}

export async function displayNameOf(client: Client, cfg: Config, userId: string): Promise<string> {
  try {
    const guild = await client.guilds.fetch(cfg.guild_id);
    const member = await guild.members.fetch(userId);
    return member.displayName;
  } catch {
    try {
      const u = await client.users.fetch(userId);
      return u.displayName ?? u.username;
    } catch {
      return "staff";
    }
  }
}

export async function dmUser(client: Client, userId: string, text: string): Promise<boolean> {
  try {
    const user = await client.users.fetch(userId);
    await user.send(text);
    return true;
  } catch {
    return false;
  }
}

export const isPrivateThreadType = (t: ChannelType) => t === ChannelType.PrivateThread;
