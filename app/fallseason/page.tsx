import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Mox Fall Season',
  description:
    'A mini fall season of Mox talks, workshops, discussions, and social events at the frontier of ideas.',
  openGraph: {
    title: 'Mox Fall Season',
    description:
      'A mini fall season of Mox talks, workshops, discussions, and social events at the frontier of ideas.',
    url: 'https://moxsf.com/fallseason',
  },
}

export default function FallSeasonPage() {
  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#faf3e6',
      }}
    >
      <iframe
        src="/fallseason/index.html?v=20261020"
        title="Mox Fall Season"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          border: 0,
        }}
      />
    </main>
  )
}
