/** Desktop-pet product copy (Chinese product copy; English fallback). */

/** Keys owned by the pet plugin's dictionary namespace. */
export type PetKey =
  | 'settings.title'
  | 'settings.themeTitle'
  | 'settings.desc'
  | 'chat.title'
  | 'chat.placeholder'
  | 'chat.send'
  | 'chat.clear'
  | 'chat.close'

/** Chinese product copy. */
export const zh: Record<PetKey, string> = {
  'settings.title': '桌面宠物',
  'settings.themeTitle': '桌面主题',
  'settings.desc': '常驻屏幕的卡通人物，可对话、跟随鼠标并记住上下文。',
  'chat.title': '聊聊',
  'chat.placeholder': '说点什么吧！',
  'chat.send': '发送',
  'chat.clear': '清空记忆',
  'chat.close': '关闭',
}

/** English fallback copy. */
export const en: Record<PetKey, string> = {
  'settings.title': 'Desktop pet',
  'settings.themeTitle': 'Desktop theme',
  'settings.desc': 'A persistent character that chats, follows the cursor, and remembers context.',
  'chat.title': 'Chat',
  'chat.placeholder': 'Say something!',
  'chat.send': 'Send',
  'chat.clear': 'Clear memory',
  'chat.close': 'Close',
}
