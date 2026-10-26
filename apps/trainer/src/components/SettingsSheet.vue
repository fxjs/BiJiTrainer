<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '../stores/settings'

const open = defineModel<boolean>('open', { required: true })

const settings = useSettingsStore()
const { soundEnabled, volume, vibrate } = storeToRefs(settings)
</script>

<template>
  <div v-if="open" class="backdrop" @click.self="open = false">
    <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header>
        <h2 id="settings-title">
          设置
        </h2>
        <button type="button" class="btn" @click="open = false">
          完成
        </button>
      </header>

      <label class="field row">
        <span class="k">音效</span>
        <input v-model="soundEnabled" type="checkbox">
      </label>

      <label class="field">
        <span class="k">音量 <span class="num">{{ Math.round(volume * 100) }}%</span></span>
        <input v-model.number="volume" type="range" min="0" max="1" step="0.05" :disabled="!soundEnabled">
      </label>

      <label class="field row">
        <span class="k">震动</span>
        <input v-model="vibrate" type="checkbox">
      </label>
      <p class="hint">
        震动仅在 Android 浏览器上有效，iOS Safari 不支持。
      </p>

      <button type="button" class="btn" @click="settings.reset()">
        恢复默认
      </button>
    </section>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: rgba(0, 0, 0, .45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  width: min(520px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  background: var(--ground);
  border-radius: 14px 14px 0 0;
  padding: 16px 16px calc(20px + env(safe-area-inset-bottom, 0px));
  display: grid;
  gap: 14px;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

h2 {
  margin: 0;
  font-family: var(--serif);
  font-size: 20px;
}

.field {
  display: grid;
  gap: 6px;
}

.field.row {
  grid-template-columns: 1fr auto;
  align-items: center;
}

.k {
  font-weight: 600;
}

.hint {
  margin: -6px 0 0;
  font-size: 13px;
  color: var(--muted);
}

.field .hint {
  margin: 0;
}

input[type="range"] {
  width: 100%;
  accent-color: var(--felt);
}

input[type="checkbox"] {
  width: 20px;
  height: 20px;
  accent-color: var(--felt);
}
</style>
