/**
 * Theme edit modal: configure one theme's name (change), background photos
 * (add only), and delete the theme. Uploads apply immediately; the name
 * applies on 保存; deletion asks for confirmation first.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ThemeConfigView } from './pet-store.ts'
import css from './EditModal.module.css'

/** Presentational props (callbacks bound to the host API by the apply world). */
export interface ThemeEditModalProps {
  id: string
  getConfig: (id: string) => Promise<ThemeConfigView>
  renameTheme: (id: string, name: string) => Promise<void>
  deleteTheme: (id: string) => Promise<void>
  uploadBackground: (id: string, name: string, data: Blob) => Promise<void>
  deleteBackground: (id: string, name: string) => Promise<void>
  restoreBackground: (id: string, name: string) => Promise<void>
  onClose: () => void
}

/**
 * Render the theme edit modal.
 * @param props - theme id and host callbacks.
 * @returns the modal element tree.
 */
export function ThemeEditModal({ id, getConfig, renameTheme, deleteTheme, uploadBackground, deleteBackground, restoreBackground, onClose }: ThemeEditModalProps) {
  const [config, setConfig] = useState<ThemeConfigView | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const reload = useCallback((): void => {
    getConfig(id).then(next => {
      setConfig(next)
      setName(next.name)
    }, () => {})
  }, [getConfig, id])

  useEffect(() => { reload() }, [reload])

  const save = useCallback((): void => {
    const trimmed = name.trim()
    if (trimmed === '') return
    setSaving(true)
    renameTheme(id, trimmed)
      .then(reload)
      .finally(() => { setSaving(false) })
  }, [id, name, renameTheme, reload])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file === undefined) return
    uploadBackground(id, file.name, file).then(reload, () => {})
  }

  const onDelete = (): void => {
    if (!window.confirm(`确定删除主题「${name}」吗？删除后不可恢复。`)) return
    deleteTheme(id).then(onClose, () => {})
  }

  const onDeleteBackground = (src: string): void => {
    const fileName = src.split('/').pop() ?? src
    if (!window.confirm(`确定删除壁纸「${fileName}」吗？`)) return
    deleteBackground(id, fileName).then(reload, () => {})
  }

  const onRestoreBackground = (fileName: string): void => {
    restoreBackground(id, fileName).then(reload, () => {})
  }

  return (
    <div className={css.overlay} role="dialog" aria-label="编辑桌面主题">
      <div className={css.panel}>
        <header className={css.header}>
          <span className={css.title}>编辑桌面主题</span>
          <button type="button" className={css.iconBtn} onClick={onClose} aria-label="关闭">×</button>
        </header>

        {config === null ? (
          <div className={css.loading}>加载中……</div>
        ) : (
          <div className={css.body}>
            {/* 主题名称（添加/改动） */}
            <section className={css.field}>
              <h4 className={css.label}>主题名称</h4>
              <input
                className={css.input}
                value={name}
                maxLength={20}
                onChange={e => { setName(e.target.value) }}
                aria-label="主题名称"
              />
            </section>

            {/* 主题照片上传（添加/删除） */}
            <section className={css.field}>
              <h4 className={css.label}>主题照片（添加/删除）</h4>
              <div className={css.thumbRow}>
                {config.backgrounds.map(src => (
                  <div key={src} className={css.thumbItem}>
                    <img className={css.thumb} src={src} alt="壁纸" />
                    <button type="button" className={css.thumbDel} onClick={() => { onDeleteBackground(src) }} aria-label="删除壁纸">×</button>
                  </div>
                ))}
                {config.backgrounds.length === 0 && <span className={css.emptyHint}>暂无照片，请添加</span>}
              </div>
              <button type="button" className={css.uploadBtn} onClick={() => { fileRef.current?.click() }}>添加照片</button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileChange} />
              {config.deletedBackgrounds.length > 0 && (
                <div className={css.fileList}>
                  <span className={css.emptyHint}>已删除（可恢复）：</span>
                  {config.deletedBackgrounds.map(fileName => (
                    <div key={fileName} className={css.fileRow}>
                      <span className={css.fileName}>{fileName}</span>
                      <button type="button" className={css.delBtn} onClick={() => { onRestoreBackground(fileName) }}>恢复</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        <footer className={css.footer}>
          <button type="button" className={css.dangerBtn} onClick={onDelete}>删除主题</button>
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
