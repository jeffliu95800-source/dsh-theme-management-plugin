/**
 * Pet edit modal: configure one character's name, pose images (upload/replace
 * only), non-interaction quotes (phase bubbles), button-interaction quotes
 * (reactions), and background music (enable/disable/upload/delete). Text
 * fields apply on 保存; uploads, toggles, and deletions apply immediately.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PetConfigView } from './pet-store.ts'
import css from './EditModal.module.css'

/** Editable text areas: phase → label, and reaction key → label. */
const BUBBLE_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['idle', '待机'],
  ['waiting', '等待'],
  ['thinking', '思考'],
  ['tool', '操作中'],
  ['done', '完成'],
]

const REACTION_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['pet', '摸头'],
  ['petCooldown', '摸头（冷却）'],
  ['pass', '传球'],
  ['passCooldown', '传球（冷却）'],
]

/** Presentational props (callbacks bound to the host API by the apply world). */
export interface PetEditModalProps {
  id: string
  getConfig: (id: string) => Promise<PetConfigView>
  renamePet: (id: string, name: string) => Promise<void>
  updateQuotes: (id: string, quotes: { bubbles?: Record<string, string>; reactions?: Record<string, string> }) => Promise<void>
  setMusicEnabled: (id: string, enabled: boolean) => Promise<void>
  deletePet: (id: string) => Promise<void>
  uploadAsset: (kind: 'pose' | 'music', id: string, name: string, data: Blob) => Promise<void>
  deleteMusic: (id: string, name: string) => Promise<void>
  onClose: () => void
}

/**
 * Render the pet edit modal.
 * @param props - pet id and host callbacks.
 * @returns the modal element tree.
 */
export function PetEditModal({
  id,
  getConfig,
  renamePet,
  updateQuotes,
  setMusicEnabled,
  deletePet,
  uploadAsset,
  deleteMusic,
  onClose,
}: PetEditModalProps) {
  const [config, setConfig] = useState<PetConfigView | null>(null)
  const [name, setName] = useState('')
  const [bubbles, setBubbles] = useState<Record<string, string>>({})
  const [reactions, setReactions] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const poseRef = useRef<HTMLInputElement | null>(null)
  const musicRef = useRef<HTMLInputElement | null>(null)

  const reload = useCallback((): void => {
    getConfig(id).then(next => {
      setConfig(next)
      setName(next.name)
      setBubbles(next.bubbles)
      setReactions(next.reactions)
    }, () => {})
  }, [getConfig, id])

  useEffect(() => { reload() }, [reload])

  const save = useCallback((): void => {
    const trimmed = name.trim()
    if (trimmed === '') return
    setSaving(true)
    Promise.all([renamePet(id, trimmed), updateQuotes(id, { bubbles, reactions })])
      .then(reload)
      .finally(() => { setSaving(false) })
  }, [id, name, bubbles, reactions, renamePet, updateQuotes, reload])

  const onPoseChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file === undefined) return
    uploadAsset('pose', id, file.name, file).then(reload, () => {})
  }

  const onMusicChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file === undefined) return
    uploadAsset('music', id, file.name, file).then(reload, () => {})
  }

  const onToggleMusic = (): void => {
    if (config === null) return
    setMusicEnabled(id, !config.music.enabled).then(reload, () => {})
  }

  const onDeleteMusic = (file: string): void => {
    deleteMusic(id, file).then(reload, () => {})
  }

  const onDeletePet = (): void => {
    if (!window.confirm(`确定删除卡通人物「${name}」吗？删除后不可恢复。`)) return
    deletePet(id).then(onClose, () => {})
  }

  return (
    <div className={css.overlay} role="dialog" aria-label="编辑卡通人物">
      <div className={css.panel}>
        <header className={css.header}>
          <span className={css.title}>编辑卡通人物</span>
          <button type="button" className={css.iconBtn} onClick={onClose} aria-label="关闭">×</button>
        </header>

        {config === null ? (
          <div className={css.loading}>加载中……</div>
        ) : (
          <div className={css.body}>
            {/* 人物名称 */}
            <section className={css.field}>
              <h4 className={css.label}>人物名称</h4>
              <input
                className={css.input}
                value={name}
                maxLength={20}
                onChange={e => { setName(e.target.value) }}
                aria-label="人物名称"
              />
            </section>

            {/* 人物形象上传（只能上传替换） */}
            <section className={css.field}>
              <h4 className={css.label}>人物形象（上传替换）</h4>
              <div className={css.thumbRow}>
                {config.poses.map(src => (
                  <img key={src} className={css.thumb} src={src} alt="造型" />
                ))}
                {config.poses.length === 0 && <span className={css.emptyHint}>暂无形象，请上传</span>}
              </div>
              <button type="button" className={css.uploadBtn} onClick={() => { poseRef.current?.click() }}>上传形象</button>
              <input ref={poseRef} type="file" accept="image/*,.svg" style={{ display: 'none' }} onChange={onPoseChange} />
            </section>

            {/* 非互动状态语录（只能替换） */}
            <section className={css.field}>
              <h4 className={css.label}>人物语录（非互动状态）</h4>
              {BUBBLE_LABELS.map(([key, label]) => (
                <label key={key} className={css.line}>
                  <span className={css.lineLabel}>{label}</span>
                  <input
                    className={css.input}
                    value={bubbles[key] ?? ''}
                    onChange={e => { setBubbles(prev => ({ ...prev, [key]: e.target.value })) }}
                  />
                </label>
              ))}
            </section>

            {/* 点按钮互动状态语录（只能替换） */}
            <section className={css.field}>
              <h4 className={css.label}>点按钮互动状态语录</h4>
              {REACTION_LABELS.map(([key, label]) => (
                <label key={key} className={css.line}>
                  <span className={css.lineLabel}>{label}</span>
                  <input
                    className={css.input}
                    value={reactions[key] ?? ''}
                    onChange={e => { setReactions(prev => ({ ...prev, [key]: e.target.value })) }}
                  />
                </label>
              ))}
            </section>

            {/* 背景音乐（开启/关闭/上传/删除） */}
            <section className={css.field}>
              <h4 className={css.label}>背景音乐</h4>
              <div className={css.musicHead}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={config.music.enabled}
                  className={config.music.enabled ? css.switchOn : css.switch}
                  onClick={onToggleMusic}
                >
                  <span className={css.knob} />
                </button>
                <span className={css.musicState}>{config.music.enabled ? '已开启' : '已关闭'}</span>
                <button type="button" className={css.uploadBtn} onClick={() => { musicRef.current?.click() }}>上传音乐</button>
                <input ref={musicRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={onMusicChange} />
              </div>
              <div className={css.fileList}>
                {config.music.files.map(src => (
                  <div key={src} className={css.fileRow}>
                    <span className={css.fileName}>{src.split('/').pop()}</span>
                    <button type="button" className={css.delBtn} onClick={() => { onDeleteMusic(src.split('/').pop() ?? src) }}>删除</button>
                  </div>
                ))}
                {config.music.files.length === 0 && <span className={css.emptyHint}>暂无音乐</span>}
              </div>
            </section>
          </div>
        )}

        <footer className={css.footer}>
          <button type="button" className={css.dangerBtn} onClick={onDeletePet}>删除卡通人物</button>
          <span className={css.footerSpacer} />
          <button type="button" className={css.ghostBtn} onClick={onClose}>关闭</button>
          <button type="button" className={css.primaryBtn} onClick={save} disabled={saving || config === null}>
            {saving ? '保存中……' : '保存'}
          </button>
        </footer>
      </div>
    </div>
  )
}
