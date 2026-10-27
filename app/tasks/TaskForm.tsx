'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { storyForFloor } from '@/app/lib/tasks-floorplans'
import FloorMap from './FloorMap'

const SKILLS = [
  'Space & setup',
  'Errand',
  'Design',
  'Writing',
  'Tech',
  'Events',
  'Ops & admin',
]
const FLOORS = ['1st floor', '2nd floor', '3rd floor', '4th floor', 'Rooftop']
const EFFORTS = ['< 1h', '1–2h', '2–3h']
const REPEATS = ['Weekly', 'Monthly']
const PRIORITIES = ['Low', 'Medium', 'High']
const TASK_TYPES = ['Volunteer', 'Contractor']
const MAX_PHOTOS = 4
const MAX_DIM = 1600

/** Serializable initial values when editing an existing task. */
export interface TaskFormInitial {
  id: string
  title: string
  summary: string
  brief: string
  doneCriteria: string
  contextLinks: string
  skills: string[]
  effort: string
  floor: string
  repeat: string
  priority: string
  taskTypes: string[]
  mapPoint: { x: number; y: number } | null
  refPhotos: { id: string; thumbUrl: string; filename: string }[]
}

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

function TaskFormModal({
  initial,
  onClose,
}: {
  initial: TaskFormInitial | null
  onClose: () => void
}) {
  const router = useRouter()
  const editing = !!initial
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [skills, setSkills] = useState<string[]>(initial?.skills ?? [])
  const [taskTypes, setTaskTypes] = useState<string[]>(
    initial?.taskTypes?.length ? initial.taskTypes : ['Volunteer']
  )
  const [photoCount, setPhotoCount] = useState(0)
  const [floor, setFloor] = useState(initial?.floor ?? '')
  const [pin, setPin] = useState<{ x: number; y: number } | null>(
    initial?.mapPoint ?? null
  )
  // Existing reference photos still attached; × removes one on save.
  const [keptPhotos, setKeptPhotos] = useState(initial?.refPhotos ?? [])
  const photosRef = useRef<HTMLInputElement>(null)

  const story = storyForFloor(floor)
  const maxNewPhotos = MAX_PHOTOS - keptPhotos.length

  function toggleSkill(s: string) {
    setSkills((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    )
  }

  function toggleType(t: string) {
    setTaskTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    )
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const form = new FormData(e.currentTarget)
      form.delete('photos')
      for (const s of skills) form.append('skills', s)
      for (const t of taskTypes) form.append('types', t)
      if (story && pin) form.set('mapPoint', `${pin.x},${pin.y}`)
      if (editing) {
        for (const p of keptPhotos) form.append('keepPhotoIds', p.id)
      }
      const files = Array.from(photosRef.current?.files ?? []).slice(
        0,
        Math.max(0, maxNewPhotos)
      )
      for (const file of files) {
        let blob: Blob = file
        try {
          blob = await compressImage(file)
        } catch {
          // Undecodable format — send as-is.
        }
        if (blob.size <= 4 * 1024 * 1024)
          form.append('photos', blob, file.name || 'photo.jpg')
      }
      const res = await fetch(
        editing ? `/api/tasks/${initial.id}` : '/api/tasks',
        { method: editing ? 'PATCH' : 'POST', body: form }
      )
      if (res.ok) {
        onClose()
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Something went wrong — try again.')
        setBusy(false)
      }
    } catch {
      setError('Something went wrong — try again.')
      setBusy(false)
    }
  }

  return (
    // tasksui re-applied here because the portal renders outside the layout wrapper.
    <div
      className="tasksui modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className="card modal-panel">
        <div className="modal-head">
          <h2>{editing ? 'Edit task' : 'New task'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <form onSubmit={submit} className="task-form">
          <label>
            Title
            <input
              name="title"
              type="text"
              required
              maxLength={120}
              defaultValue={initial?.title}
              placeholder="Fix the wobbly table by the window"
            />
          </label>
          <label>
            Card blurb
            <input
              name="summary"
              type="text"
              maxLength={200}
              defaultValue={initial?.summary}
              placeholder="One or two sentences shown on the board"
            />
          </label>
          <div className="skill-picker">
            <span className="picker-label">
              Who&rsquo;s it for? <span style={{ fontWeight: 400 }}>(one or both)</span>
            </span>
            <div className="chips">
              {TASK_TYPES.map((t) => (
                <button
                  type="button"
                  key={t}
                  data-type={t}
                  onClick={() => toggleType(t)}
                  className={`chip chip-toggle${taskTypes.includes(t) ? ' chip-on' : ''}`}
                >
                  {t === 'Volunteer' ? 'Volunteers' : 'Contractors'}
                </button>
              ))}
            </div>
          </div>
          <div className="form-row">
            <label>
              Floor
              <select
                name="floor"
                value={floor}
                onChange={(e) => {
                  setFloor(e.target.value)
                  setPin(null)
                }}
              >
                <option value="">Anywhere</option>
                {FLOORS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Effort
              <select name="effort" defaultValue={initial?.effort ?? ''}>
                <option value="">Not sure</option>
                {EFFORTS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Repeats
              <select name="repeat" defaultValue={initial?.repeat ?? ''}>
                <option value="">Never</option>
                {REPEATS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select name="priority" defaultValue={initial?.priority || 'Medium'}>
                {PRIORITIES.map((pr) => (
                  <option key={pr} value={pr}>
                    {pr}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="skill-picker">
            <span className="picker-label">Skills</span>
            <div className="chips">
              {SKILLS.map((s) => (
                <button
                  type="button"
                  key={s}
                  data-skill={skills.includes(s) ? s : undefined}
                  onClick={() => toggleSkill(s)}
                  className={`chip chip-toggle${skills.includes(s) ? ' chip-on' : ''}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {story && (
            <div className="skill-picker">
              <span className="picker-label">
                Pin it on the map (optional)
                {pin && (
                  <button
                    type="button"
                    className="map-clear"
                    onClick={() => setPin(null)}
                  >
                    clear pin
                  </button>
                )}
              </span>
              <FloorMap
                story={story}
                pin={pin}
                interactive
                onPick={setPin}
                height={230}
              />
            </div>
          )}
          <label>
            The task
            <textarea
              name="brief"
              rows={4}
              defaultValue={initial?.brief}
              placeholder="What needs doing, where things are, anything they should know…"
            />
          </label>
          <label>
            What done looks like
            <textarea
              name="doneCriteria"
              rows={2}
              defaultValue={initial?.doneCriteria}
              placeholder="How they'll know it's finished"
            />
          </label>
          <label>
            Links
            <textarea
              name="contextLinks"
              rows={2}
              defaultValue={initial?.contextLinks}
              placeholder={'Label | https://…  (one per line)'}
            />
          </label>
          {keptPhotos.length > 0 && (
            <div className="skill-picker">
              <span className="picker-label">Current photos</span>
              <div className="kept-photos">
                {keptPhotos.map((p) => (
                  <div key={p.id} className="kept-photo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.thumbUrl} alt={p.filename} />
                    <button
                      type="button"
                      aria-label={`Remove ${p.filename}`}
                      onClick={() =>
                        setKeptPhotos((prev) =>
                          prev.filter((x) => x.id !== p.id)
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {maxNewPhotos > 0 && (
            <label className={`file-label${photoCount ? ' has-file' : ''}`}>
              <input
                ref={photosRef}
                name="photos"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setPhotoCount(e.target.files?.length ?? 0)}
              />
              {photoCount
                ? `📸 ${photoCount} photo${photoCount > 1 ? 's' : ''} to ${editing ? 'add' : 'attach'}`
                : `📷 Add reference photos (optional, up to ${maxNewPhotos})`}
            </label>
          )}
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add to the board'}
          </button>
        </form>
      </div>
    </div>
  )
}

/** Header button for organizers: opens the create form. */
export function AddTaskButton() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        + Add task
      </button>
      {open &&
        mounted &&
        createPortal(
          <TaskFormModal initial={null} onClose={() => setOpen(false)} />,
          document.body
        )}
    </>
  )
}

/** Edit + Archive controls on a task page, for organizers and the creator. */
export function ManageTaskButtons({ task }: { task: TaskFormInitial }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  async function archive() {
    if (
      !confirm(
        'Archive this task? It disappears from the board (it stays in Airtable).'
      )
    )
      return
    setBusy(true)
    const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/tasks')
      router.refresh()
    } else {
      setBusy(false)
      alert('Could not archive — try again.')
    }
  }

  return (
    <span className="card-top-right">
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        ✎ Edit task
      </button>
      <button className="btn-quiet" onClick={archive} disabled={busy}>
        {busy ? 'Archiving…' : 'Archive'}
      </button>
      {open &&
        mounted &&
        createPortal(
          <TaskFormModal initial={task} onClose={() => setOpen(false)} />,
          document.body
        )}
    </span>
  )
}
