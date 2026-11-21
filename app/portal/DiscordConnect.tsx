import { DiscordIcon } from './DiscordIcon'

// Outcomes of "connect discord" (/portal/auth/discord?link=1), passed back as
// /portal?discord=<outcome>. The magic-link flow from the bot's /login command
// still uses ?discord_linked=true.
const OUTCOMES: Record<string, { tone: 'success' | 'warning' | 'error'; text: React.ReactNode }> = {
  connected: {
    tone: 'success',
    text: "discord connected. you're in the mox server with your member role.",
  },
  connected_no_role: {
    tone: 'success',
    text: 'discord connected. your member role will show up in the server within a few minutes.',
  },
  join_failed: {
    tone: 'warning',
    text: (
      <>
        we saved your discord account but couldn&apos;t add you to the server.{' '}
        <a href="/discord">join with the invite link</a> and your member role
        shows up within a few minutes.
      </>
    ),
  },
  taken: {
    tone: 'error',
    text: 'that discord account is already connected to another mox membership. email team@moxsf.com and we’ll sort it out.',
  },
  discord_denied: {
    tone: 'warning',
    text: 'discord connection cancelled. nothing was changed.',
  },
}

const FALLBACK = {
  tone: 'error' as const,
  text: "couldn't connect discord. please try again.",
}

export function DiscordOutcome({ outcome }: { outcome: string }) {
  const { tone, text } = OUTCOMES[outcome] ?? FALLBACK
  return (
    <div className={`alert ${tone}`} role="status">
      {text}
    </div>
  )
}

/** Shown to active members whose People record has no Discord username yet. */
export default function DiscordConnect({ isViewingAs }: { isViewingAs: boolean }) {
  return (
    <section className="discord-invite" aria-labelledby="discord-invite-title">
      <h2 id="discord-invite-title">join the mox discord</h2>
      <p>
        it&apos;s where members trade intros, plan events, and hear about
        what&apos;s happening in the building.
      </p>

      {isViewingAs ? (
        <p className="muted">
          the member sees a &ldquo;connect discord&rdquo; button here. it
          connects whoever is logged in, so it&apos;s hidden while viewing as.
        </p>
      ) : (
        <div className="discord-invite-action">
          <a href="/portal/auth/discord?link=1" className="discord-connect">
            <DiscordIcon size={18} />
            connect discord
          </a>
          <span className="muted">
            adds you to the server with your member role
          </span>
        </div>
      )}

      <p className="discord-invite-alt muted">
        rather do it by hand? <a href="/discord">open the invite</a>, then add
        your username on <a href="/portal/profile/edit">your profile</a>.
      </p>
    </section>
  )
}
