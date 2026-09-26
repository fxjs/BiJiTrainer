import { SoundBoard } from '@biji/audio'

/** 全局唯一的音效实例；选项由 settings store 同步 */
export const sound = new SoundBoard({ enabled: true, volume: 0.6, vibrate: true })
