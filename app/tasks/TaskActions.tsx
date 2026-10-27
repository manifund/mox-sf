'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

const PRIMARY = 'btn btn-primary btn-block'
const ERROR = 'error'

async function readError(res: Response): Promise<string> {
  try {
    return (await res.json()).error || 'Something went wrong — try again.'
  } catch {
    return 'Something went wrong — try again.'
  }
}

export function ClaimButton({ taskId }: { taskId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function claim() {
    setBusy(true)
    setError('')
    const res = await fetch(`/api/tasks/${taskId}/claim`, { method: 'POST' })
    if (res.ok) {
      router.refresh()
    } else {
      setError(await readError(res))
      setBusy(false)
      router.refresh()
    }
  }

  return (
    <>
      <button className={PRIMARY} onClick={claim} disabled={busy}>
        {busy ? 'Claiming…' : 'Claim this task'}
      </button>
      {error && <p className={ERROR}>{error}</p>}
    </>
  )
}

const MAX_DIM = 1600

async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('compress failed'))),
      'image/jpeg',
      0.85
    )
  )
}

export function DonePanel({ taskId }: { taskId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  async function markDone() {
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.set('note', noteRef.current?.value || '')
      const file = fileRef.current?.files?.[0]
      if (file) {
        let blob: Blob = file
        try {
          blob = await compressImage(file)
        } catch {
          // Undecodable format (e.g. HEIC outside Safari) — send as-is.
        }
        if (blob.size > 4 * 1024 * 1024) {
          setError(
            'That photo is too large even after compression — try a smaller one.'
          )
          setBusy(false)
          return
        }
        form.set('photo', blob, 'proof.jpg')
      }
      const res = await fetch(`/api/tasks/${taskId}/complete`, {
        method: 'POST',
        body: form,
      })
      if (res.ok) router.refresh()
      else {
        setError(await readError(res))
        setBusy(false)
      }
    } catch {
      setError('Something went wrong — try again.')
      setBusy(false)
    }
  }

  async function release() {
    if (!confirm('Put this task back on the board for someone else?')) return
    setBusy(true)
    const res = await fetch(`/api/tasks/${taskId}/release`, { method: 'POST' })
    if (res.ok) router.refresh()
    else {
      setError(await readError(res))
      setBusy(false)
    }
  }

  return (
    <>
      <textarea
        ref={noteRef}
        rows={3}
        placeholder="Anything to note? (optional)"
      />
      <label className={`file-label${fileName ? ' has-file' : ''}`}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={(e) => setFileName(e.target.files?.[0]?.name || '')}
        />
        {fileName ? `📸 ${fileName}` : '📷 Add a proof photo (optional)'}
      </label>
      <button className={PRIMARY} onClick={markDone} disabled={busy}>
        {busy ? 'Saving…' : 'Mark as done'}
      </button>
      <p className="hint">
        The Mox team gives every completion a quick look before closing it.
      </p>
      {error && <p className={ERROR}>{error}</p>}
      <hr className="divider" />
      <button onClick={release} disabled={busy} className="btn-quiet">
        Can&rsquo;t get to it today? Release the task
      </button>
    </>
  )
}
