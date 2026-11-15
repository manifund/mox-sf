import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Front door | Mox',
  description: 'Enter your door code to unlock the Mox front door.',
  robots: { index: false, follow: false },
}

export default function DoorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
