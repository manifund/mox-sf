'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

export default function CommentForm({ taskId }: { taskId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const textRef = useRef<HTMLTextAreaElement>(null)

  async function post() {
    const text = textRef.current?.value.trim()
    if (!text) return
    setBusy(true)
    setError('')
    const res = await fetch(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (res.ok) {
      if (textRef.current) textRef.current.value = ''
      setBusy(false)
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Something went wrong — try again.')
      setBusy(false)
    }
  }

  return (
    <div className="comment-form">
      <textarea
        ref={textRef}
        rows={2}
        maxLength={2000}
        placeholder="Ask a question, add context, flag an issue…"
      />
      <button className="btn btn-primary btn-sm" onClick={post} disabled={busy}>
        {busy ? 'Posting…' : 'Post'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
