/**
 * Chat popup for the pet: a floating panel with the conversation history, an
 * input, and send/clear/close actions. Presentational — messages and callbacks
 * arrive from the owning Pet component; it holds only the draft text.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage } from './pet-store.ts'
import type { PetKey } from './locales.ts'
import css from './ChatPopup.module.css'

/** Presentational props. */
export interface ChatPopupProps {
  /** Conversation memory, oldest first. */
  messages: readonly ChatMessage[]
  /** Locale translator for the chat chrome. */
  t: (key: PetKey) => string
  /** Submit a user message. */
  onSend: (text: string) => void
  /** Drop the conversation memory. */
  onClear: () => void
  /** Close the popup. */
  onClose: () => void
}

/**
 * Render the chat popup.
 * @param props - messages, translator, and actions.
 * @returns the popup element tree.
 */
export function ChatPopup({ messages, t, onSend, onClear, onClose }: ChatPopupProps) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current
    if (el === null) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  const submit = useCallback(() => {
    const text = draft.trim()
    if (text === '') return
    onSend(text)
    setDraft('')
  }, [draft, onSend])

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submit()
  }, [submit])

  return (
    <div className={css.popup} role="dialog" aria-label={t('chat.title')}>
      <header className={css.header}>
        <span className={css.title}>{t('chat.title')}</span>
        <button type="button" className={css.iconBtn} onClick={onClose} aria-label={t('chat.close')}>×</button>
      </header>
      <div className={css.list} ref={listRef}>
        {messages.length === 0
          ? <div className={css.empty}>……</div>
          : messages.map((m, i) => (
            <div key={`${m.at}-${i}`} className={m.role === 'user' ? css.userRow : css.petRow}>
              <div className={m.role === 'user' ? css.userBubble : css.petBubble}>{m.text}</div>
            </div>
          ))}
      </div>
      <footer className={css.footer}>
        <input
          className={css.input}
          value={draft}
          onChange={e => { setDraft(e.target.value) }}
          onKeyDown={onKeyDown}
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.placeholder')}
        />
        <button type="button" className={css.send} onClick={submit}>{t('chat.send')}</button>
      </footer>
      <button type="button" className={css.clear} onClick={onClear}>{t('chat.clear')}</button>
    </div>
  )
}
