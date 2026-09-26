import { DEFAULT_LAMBDA } from '@biji/solver'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { sound } from '../sound'

const STORAGE_KEY = 'biji-trainer:settings'

interface PersistedSettings {
  lambda: number
  soundEnabled: boolean
  volume: number
  vibrate: boolean
}

const DEFAULTS: PersistedSettings = {
  lambda: DEFAULT_LAMBDA,
  soundEnabled: true,
  volume: 0.6,
  vibrate: true,
}

/** localStorage 在隐私模式或被禁用时会抛异常，读写都要兜底 */
function load(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) as Partial<PersistedSettings> } : { ...DEFAULTS }
  }
  catch {
    return { ...DEFAULTS }
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const init = load()
  /** 风险系数 λ：效用 = 平均得分 − λ × 标准差 */
  const lambda = ref(init.lambda)
  const soundEnabled = ref(init.soundEnabled)
  const volume = ref(init.volume)
  const vibrate = ref(init.vibrate)

  watch([lambda, soundEnabled, volume, vibrate], () => {
    sound.setOptions({ enabled: soundEnabled.value, volume: volume.value, vibrate: vibrate.value })
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        lambda: lambda.value,
        soundEnabled: soundEnabled.value,
        volume: volume.value,
        vibrate: vibrate.value,
      } satisfies PersistedSettings))
    }
    catch {
      // 无法持久化时仅在本次会话内生效
    }
  }, { immediate: true })

  function reset() {
    lambda.value = DEFAULTS.lambda
    soundEnabled.value = DEFAULTS.soundEnabled
    volume.value = DEFAULTS.volume
    vibrate.value = DEFAULTS.vibrate
  }

  return { lambda, soundEnabled, volume, vibrate, reset }
})
