/**
 * The Sakuragi pet terminal rendered into `shell.overlay`. Reads the host
 * snapshot from the entry store and renders one of the four vector (SVG)
 * pose files, rotating to the next every hour. The character card tilts toward
 * the cursor and is the drag handle; a hidden pet collapses to a summon button.
 */
import { useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createPetStore } from './pet-store.ts'
import { ChatPopup } from './ChatPopup.tsx'
import css from './Pet.module.css'

/** Injected business face (bound to the host API and store actions). */
export interface PetInjected {
  pet: () => void
  pass: () => void
  hide: () => void
  summon: () => void
  send: (text: string) => void
  clear: () => void
  feedbackDone: () => void
  /** Persist a finished drag as viewport right/bottom insets (px). */
  dragEnd: (right: number, bottom: number) => void
  /** Upload a skin asset (background image or character pose). */
  upload: (kind: 'background' | 'pose', name: string, data: Blob) => void
}

/** Full component props: runtime + store + locale seats and the injected face. */
export type PetProps =
  PropsRuntime<'shell.overlay'> & PropsRenderSlots<never>
  & PropsStore<ReturnType<typeof createPetStore>>
  & PropsLocale<'pet'> & PetInjected

/** Reaction bubble auto-dismiss. */
const FEEDBACK_TTL_MS = 3200
/** Maximum tilt (degrees) applied as the cursor moves across the pet. */
const MAX_TILT_DEG = 10
/** Viewport edge margin for dragging. */
const EDGE_MARGIN = 16
/** Movement (px) below which a pointer gesture counts as a click, not a drag. */
const DRAG_THRESHOLD = 3

/** Rotation period: one pose per hour, keyed to wall-clock time. */
const ROTATE_MS = 3600_000

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Wall-clock pose index (deterministic across reloads; changes hourly). */
function poseIndexNow(count: number): number {
  return Math.floor(Date.now() / ROTATE_MS) % Math.max(1, count)
}

/**
 * Render the pet (or its summon button when hidden).
 * @param props - composed slot props.
 * @returns the pet element tree.
 */
export function Pet({ useStore, t, pet, pass, hide, summon, send, clear, feedbackDone, dragEnd, upload }: PetProps) {
  const snapshot = useStore(s => s.snapshot)
  const feedback = useStore(s => s.feedback)
  const messages = useStore(s => s.messages)
  const [chatOpen, setChatOpen] = useState(false)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [poseIndex, setPoseIndex] = useState(() => poseIndexNow(1))
  const [pos, setPos] = useState(() => ({
    x: Math.max(EDGE_MARGIN, window.innerWidth - 200),
    y: Math.max(EDGE_MARGIN, window.innerHeight - 320),
  }))

  const petRef = useRef<HTMLDivElement | null>(null)
  const initializedRef = useRef(false)
  const sizeRef = useRef(180)
  const poseCountRef = useRef(1)
  const dragRef = useRef({ active: false, startX: 0, startY: 0, posX: 0, posY: 0, moved: false })
  if (snapshot !== null) {
    sizeRef.current = snapshot.display.size
    poseCountRef.current = snapshot.poses.length
  }

  // Auto-dismiss the transient reaction bubble.
  useEffect(() => {
    if (feedback === null) return
    const id = window.setTimeout(feedbackDone, FEEDBACK_TTL_MS)
    return () => { window.clearTimeout(id) }
  }, [feedback, feedbackDone])

  // Tilt the card toward the cursor for the 3D feel.
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const el = petRef.current
      if (el === null) return
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / Math.max(1, rect.width / 2)))
      const ny = Math.max(-1, Math.min(1, (e.clientY - cy) / Math.max(1, rect.height / 2)))
      setTilt({ x: -ny * MAX_TILT_DEG, y: nx * MAX_TILT_DEG })
    }
    window.addEventListener('mousemove', onMove)
    return () => { window.removeEventListener('mousemove', onMove) }
  }, [])

  // Rotate the pose on the hour (rescheduled to the next boundary each tick).
  useEffect(() => {
    let timer = 0
    const tick = (): void => {
      setPoseIndex(poseIndexNow(poseCountRef.current))
      const nextBoundary = (Math.floor(Date.now() / ROTATE_MS) + 1) * ROTATE_MS
      timer = window.setTimeout(tick, nextBoundary - Date.now() + 100)
    }
    const nextBoundary = (Math.floor(Date.now() / ROTATE_MS) + 1) * ROTATE_MS
    timer = window.setTimeout(tick, nextBoundary - Date.now() + 100)
    return () => { window.clearTimeout(timer) }
  }, [])

  // Seed the position from the persisted right/bottom inset once.
  useEffect(() => {
    if (snapshot === null || initializedRef.current) return
    initializedRef.current = true
    const size = snapshot.display.size
    setPos({
      x: clamp(window.innerWidth - snapshot.display.right - size, EDGE_MARGIN, Math.max(EDGE_MARGIN, window.innerWidth - size - EDGE_MARGIN)),
      y: clamp(window.innerHeight - snapshot.display.bottom - size - 100, EDGE_MARGIN, Math.max(EDGE_MARGIN, window.innerHeight - size - 130)),
    })
  }, [snapshot])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, posX: pos.x, posY: pos.y, moved: false }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current.active) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) dragRef.current.moved = true
    const size = sizeRef.current
    setPos({
      x: clamp(dragRef.current.posX + dx, EDGE_MARGIN, Math.max(EDGE_MARGIN, window.innerWidth - size - EDGE_MARGIN)),
      y: clamp(dragRef.current.posY + dy, EDGE_MARGIN, Math.max(EDGE_MARGIN, window.innerHeight - size - 130)),
    })
  }

  const onPointerUp = (_e: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    setDragging(false)
    if (!dragRef.current.moved) {
      setChatOpen(open => !open)
      return
    }
    const el = petRef.current
    if (el !== null) {
      const rect = el.getBoundingClientRect()
      dragEnd(window.innerWidth - rect.right, window.innerHeight - rect.bottom)
    }
  }

  const onUploadChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file === undefined) return
    // Heuristic: .svg → character pose; other images → background.
    const kind = file.name.toLowerCase().endsWith('.svg') ? 'pose' : 'background'
    upload(kind, file.name, file)
  }

  if (snapshot === null) return null

  if (!snapshot.display.visible) {
    return (
      <button type="button" className={css.summon} onClick={summon} aria-label={t('settings.title')}>
        樱木
      </button>
    )
  }

  const { display, bubble, name, poses } = snapshot
  const line = feedback?.text ?? bubble
  const activePose = poses.length > 0 ? poses[poseIndex % poses.length] : undefined

  return (
    <div
      className={css.pet}
      ref={petRef}
      style={{ left: pos.x, top: pos.y }}
      data-dragging={dragging || undefined}
    >
      {line !== undefined && (
        <div className={css.bubble} onClick={feedbackDone}>{line}</div>
      )}
      <div
        className={css.portrait}
        style={{ width: display.size, height: display.size }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div
          className={css.tilt}
          style={{ transform: `perspective(600px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
        >
          {activePose !== undefined && (
            <img
              className={css.figure}
              src={`/sakuragi/poses/${activePose}`}
              alt={name}
              draggable={false}
            />
          )}
        </div>
      </div>
      <div className={css.actions}>
        <button type="button" className={css.action} onClick={pet}>摸头</button>
        <button type="button" className={css.action} onClick={pass}>传球</button>
        <button type="button" className={css.action} onClick={() => { setChatOpen(o => !o) }}>聊</button>
        <button type="button" className={css.action} onClick={() => { fileRef.current?.click() }}>上传</button>
        <button type="button" className={css.action} onClick={hide}>隐藏</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*,.svg" style={{ display: 'none' }} onChange={onUploadChange} />
      {chatOpen && (
        <ChatPopup
          messages={messages}
          t={t}
          onSend={send}
          onClear={clear}
          onClose={() => { setChatOpen(false) }}
        />
      )}
    </div>
  )
}
