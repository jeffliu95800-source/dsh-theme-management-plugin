/**
 * General-settings skin manager: two sections — 桌面宠物 (visibility switch +
 * new-pet + pet list) and 桌面主题 (new-theme + theme list). Only the active
 * pet is displayed at a time; activating another replaces it.
 */
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createPetStore } from './pet-store.ts'
import css from './SettingsRow.module.css'

/** Injected business face. */
export interface PetSettingsInjected {
  setVisible: (visible: boolean) => void
  createPet: (name: string) => void
  activatePet: (id: string) => void
  createTheme: (name: string) => void
  activateTheme: (id: string) => void
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
export function PetSettingsRow({ useStore, setVisible, createPet, activatePet, createTheme, activateTheme, t }: PetSettingsProps) {
  const visible = useStore(s => s.snapshot?.display.visible ?? true)
  const pets = useStore(s => s.pets)
  const themes = useStore(s => s.themes)

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
            <button
              type="button"
              className={css.activeBtn}
              disabled={p.active}
              onClick={() => { activatePet(p.id) }}
            >{p.active ? '当前' : '设为当前'}</button>
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
            <button
              type="button"
              className={css.activeBtn}
              disabled={th.active}
              onClick={() => { activateTheme(th.id) }}
            >{th.active ? '当前' : '设为当前'}</button>
          </div>
        ))}
      </div>
    </>
  )
}
