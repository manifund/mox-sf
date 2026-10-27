import React from 'react'

/** Status → .badge-* modifier class (see tasks.css). */
export const STATUS_BADGE: Record<string, string> = {
  Open: 'badge-open',
  Claimed: 'badge-claimed',
  'In review': 'badge-review',
  Done: 'badge-done',
}

export const STATUS_LABEL: Record<string, string> = {
  Open: 'Open',
  Claimed: 'In progress',
  'In review': 'Wrapping up',
  Done: 'Completed',
}

/** Glowing urgency dot: blue = Low, amber = Medium (default), red = High. */
export function PriorityDot({ priority }: { priority: string }) {
  const level = ['Low', 'Medium', 'High'].includes(priority)
    ? priority
    : 'Medium'
  return (
    <span
      className={`prio-dot prio-${level.toLowerCase()}`}
      title={`${level} priority`}
    />
  )
}

function linkify(text: string): React.ReactNode[] {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    part.match(/^https?:\/\//) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">
        {part.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
      </a>
    ) : (
      part
    )
  )
}

export function Prose({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim())
  return (
    <div className="prose">
      {paragraphs.map((para, i) => (
        <p key={i}>
          {para.split('\n').map((line, j) => (
            <React.Fragment key={j}>
              {j > 0 && <br />}
              {linkify(line)}
            </React.Fragment>
          ))}
        </p>
      ))}
    </div>
  )
}
