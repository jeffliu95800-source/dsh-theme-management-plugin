/**
 * General-settings skin manager: two sections — 桌面宠物 (visibility switch +
 * new-pet + pet list with edit) and 桌面主题 (new-theme + theme list with edit).
 * Only the active pet is displayed at a time; activating another replaces it.
 * Editing opens a modal per item (PetEditModal / ThemeEditModal).
 */
import { useState } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createPetStore, PetConfigView, ThemeConfigView } from './pet-store.ts'
import { PetEditModal } from './PetEditModal.tsx'
import { ThemeEditModal } from './ThemeEditModal.tsx'
import css from './SettingsRow.module.css'

/** Injected business face. */
export interface PetSettingsInjected {
  setVisible: (visible: boolean) => void
  createPet: (name: string) => void
  activatePet: (id: string) => void
  createTheme: (name: string) => void
  activateTheme: (id: string) => void
  getPetConfig: (id: string) => Promise<PetConfigView>
  renamePet: (id: string, name: string) => Promise<void>
  updatePetQuotes: (id: string, quotes: { bubbles?: Record<string, string>; reactions?: Record<string, string> }) => Promise<void>
  updatePetActions: (id: string, actions: { pet: string; pass: string }) => Promise<void>
  setPetMusicEnabled: (id: string, enabled: boolean) => Promise<void>
  deletePet: (id: string) => Promise<void>
  uploadPetAsset: (kind: 'pose' | 'music', id: string, name: string, data: Blob) => Promise<void>
  deleteMusic: (id: string, name: string) => Promise<void>
  getThemeConfig: (id: string) => Promise<ThemeConfigView>
  renameTheme: (id: string, name: string) => Promise<void>
  deleteTheme: (id: string) => Promise<void>
  uploadThemeBackground: (id: string, name: string, data: Blob) => Promise<void>
}

/** Full component props: runtime + store + locale seats and the injected face. */
export type PetSettingsProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createPetStore>>
  & PropsLocale<'pet'> & PetSettingsInjected

/**
 * Render the skin manager rows.
 * @param props - composed slot props.
 * @returns the rows element tree.
 */
export function PetSettingsRow({
  useStore,
  setVisible,
  createPet,
  activatePet,
  createTheme,
  activateTheme,
  getPetConfig,
  renamePet,
  updatePetQuotes,
  updatePetActions,
  setPetMusicEnabled,
  deletePet,
  uploadPetAsset,
  deleteMusic,
  getThemeConfig,
  renameTheme,
  deleteTheme,
  uploadThemeBackground,
  t,
}: PetSettingsProps) {
  const visible = useStore(s => s.snapshot?.display.visible ?? true)
  const pets = useStore(s => s.pets)
  const themes = useStore(s => s.themes)
  const [editingPet, setEditingPet] = useState<string | null>(null)
  const [editingTheme, setEditingTheme] = useState<string | null>(null)

  const promptNew = (what: string): string | null => window.prompt(what)

  return (
    <>
      {/* 桌面宠物 */}
      <div className={css.section}>
        <div className={css.sectionHead}>
          <span className={css.sectionTitle}>{t('settings.title')}</span>
          <button
            type="button"
            role="switch"
            aria-checked={visible}
            className={visible ? css.switchOn : css.switch}
            onClick={() => { setVisible(!visible) }}
          >
            <span className={css.knob} />
          </button>
        </div>
        <button type="button" className={css.newBtn} onClick={() => {
          const name = promptNew('新宠物名称')
          if (name !== null && name.trim() !== '') createPet(name.trim())
        }}>新建宠物</button>
        {pets.map(p => (
          <div key={p.id} className={css.row}>
            <span className={css.rowName}>{p.name}</span>
            <span className={css.rowActions}>
              <button
                type="button"
                className={css.activeBtn}
                disabled={p.active}
                onClick={() => { activatePet(p.id) }}
              >{p.active ? '当前' : '设为当前'}</button>
              <button type="button" className={css.editBtn} onClick={() => { setEditingPet(p.id) }}>编辑</button>
            </span>
          </div>
        ))}
      </div>

      {/* 桌面主题 */}
      <div className={css.section}>
        <div className={css.sectionHead}>
          <span className={css.sectionTitle}>{t('settings.themeTitle')}</span>
        </div>
        <button type="button" className={css.newBtn} onClick={() => {
          const name = promptNew('新主题名称')
          if (name !== null && name.trim() !== '') createTheme(name.trim())
        }}>新建主题</button>
        {themes.map(th => (
          <div key={th.id} className={css.row}>
            <span className={css.rowName}>{th.name}</span>
            <span className={css.rowActions}>
              <button
                type="button"
                className={css.activeBtn}
                disabled={th.active}
                onClick={() => { activateTheme(th.id) }}
              >{th.active ? '当前' : '设为当前'}</button>
              <button type="button" className={css.editBtn} onClick={() => { setEditingTheme(th.id) }}>编辑</button>
            </span>
          </div>
        ))}
      </div>

      {editingPet !== null && (
        <PetEditModal
          id={editingPet}
          getConfig={getPetConfig}
          renamePet={renamePet}
          updateQuotes={updatePetQuotes}
          updateActions={updatePetActions}
          setMusicEnabled={setPetMusicEnabled}
          deletePet={deletePet}
          uploadAsset={uploadPetAsset}
          deleteMusic={deleteMusic}
          onClose={() => { setEditingPet(null) }}
        />
      )}
      {editingTheme !== null && (
        <ThemeEditModal
          id={editingTheme}
          getConfig={getThemeConfig}
          renameTheme={renameTheme}
          deleteTheme={deleteTheme}
          uploadBackground={uploadThemeBackground}
          onClose={() => { setEditingTheme(null) }}
        />
      )}
    </>
  )
}
