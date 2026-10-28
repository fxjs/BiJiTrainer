<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onBeforeUnmount, ref, useId, watch } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { sound } from '../sound'

const open = defineModel<boolean>('open', { required: true })
const settings = useSettingsStore()
const { soundEnabled, volume, vibrate } = storeToRefs(settings)
const id = useId()
const dialog = ref<HTMLDialogElement | null>(null)
const resetNotice = ref('')
let opener: HTMLElement | null = null
let backdropPressed = false

function restoreFocus() {
  if (opener?.isConnected)
    opener.focus({ preventScroll: true })
  opener = null
}

function close() {
  open.value = false
}

function onNativeClose() {
  if (dialog.value?.open)
    return
  open.value = false
  restoreFocus()
}

function outsideDialog(event: MouseEvent | PointerEvent) {
  const bounds = dialog.value?.getBoundingClientRect()
  return bounds !== undefined && (
    event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom
  )
}

function onBackdropPointerDown(event: PointerEvent) {
  backdropPressed = event.target === dialog.value && outsideDialog(event)
}

function onBackdropClick(event: MouseEvent) {
  if (backdropPressed && outsideDialog(event))
    close()
  backdropPressed = false
}

function resetSettings() {
  settings.reset()
  resetNotice.value = '已恢复默认：音效开启、音量 60%、震动开启。'
}

function previewSound(name: 'place' | 'best') {
  if (!soundEnabled.value || volume.value <= 0)
    return
  sound.stop()
  sound.unlock()
  sound.play(name, { haptic: false })
}

watch([open, dialog], ([isOpen, element]) => {
  if (!element)
    return
  if (isOpen && !element.open) {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    resetNotice.value = ''
    element.showModal()
  }
  else if (!isOpen && element.open) {
    element.close()
    restoreFocus()
  }
}, { immediate: true, flush: 'post' })

onBeforeUnmount(() => {
  dialog.value?.close()
  restoreFocus()
})
</script>

<template>
  <dialog
    ref="dialog"
    class="sheet"
    :aria-labelledby="`${id}-title`"
    :aria-describedby="`${id}-description`"
    @cancel.prevent="close"
    @close="onNativeClose"
    @pointerdown="onBackdropPointerDown"
    @click="onBackdropClick"
  >
    <div class="sheet-content">
      <header class="sheet-header">
        <div>
          <h2 :id="`${id}-title`">
            游戏设置
          </h2>
          <p :id="`${id}-description`" class="hint">
            调整出牌时的声音与触感，即时生效。
          </p>
        </div>
        <button type="button" class="btn close-button" autofocus @click="close">
          完成
        </button>
      </header>

      <div class="preferences">
        <label class="preference toggle-row" :for="`${id}-sound`">
          <span class="preference-copy">
            <span class="preference-name">音效</span>
            <span :id="`${id}-sound-hint`" class="hint">出牌与操作时播放提示音</span>
          </span>
          <input
            :id="`${id}-sound`"
            v-model="soundEnabled"
            type="checkbox"
            :aria-describedby="`${id}-sound-hint`"
          >
        </label>

        <div class="preference volume-row" :class="{ muted: !soundEnabled }">
          <label class="volume-label" :for="`${id}-volume`">
            <span class="preference-name">音量</span>
            <span class="volume-value">{{ Math.round(volume * 100) }}<span>%</span></span>
          </label>
          <input
            :id="`${id}-volume`"
            v-model.number="volume"
            type="range"
            min="0"
            max="1"
            step="0.05"
            :aria-valuetext="`${Math.round(volume * 100)}%`"
            :aria-describedby="!soundEnabled ? `${id}-volume-hint` : undefined"
            :disabled="!soundEnabled"
          >
          <p v-if="!soundEnabled" :id="`${id}-volume-hint`" class="hint">
            开启音效后可调节音量。
          </p>
        </div>
        <div class="sound-preview" aria-label="音效试听">
          <button type="button" class="btn" :disabled="!soundEnabled || volume <= 0" @click="previewSound('place')">试听落牌</button>
          <button type="button" class="btn" :disabled="!soundEnabled || volume <= 0" @click="previewSound('best')">试听最优反馈</button>
        </div>

        <label class="preference toggle-row" :for="`${id}-vibrate`">
          <span class="preference-copy">
            <span class="preference-name">震动反馈</span>
            <span :id="`${id}-vibrate-hint`" class="hint">支持的 Android 浏览器可用，iOS Safari 不支持。</span>
          </span>
          <input
            :id="`${id}-vibrate`"
            v-model="vibrate"
            type="checkbox"
            :aria-describedby="`${id}-vibrate-hint`"
          >
        </label>
      </div>

      <footer class="sheet-footer">
        <p class="hint">偏好设置仅保存在当前浏览器。</p>
        <button type="button" class="btn reset-button" @click="resetSettings">
          恢复默认
        </button>
      </footer>
      <p v-if="resetNotice" class="reset-notice" role="status">
        {{ resetNotice }}
      </p>
    </div>
  </dialog>
</template>

<style scoped>
.sheet {
  width: min(500px, calc(100% - 32px));
  max-width: none;
  max-height: calc(100dvh - 48px);
  margin: auto;
  padding: 0;
  overflow: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--rule);
  border-radius: 12px;
  background: var(--surface);
  color: var(--ink);
  font-family: var(--sans);
  color-scheme: dark;
}

.sheet[open] {
  animation: sheet-enter var(--motion-base) var(--ease-out);
}

.sheet::backdrop {
  background: rgb(0 0 0 / .72);
}

.sheet-content {
  padding: 24px;
}

.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding-bottom: 24px;
}

.sheet-header > div {
  min-width: 0;
}

h2 {
  margin: 0 0 6px;
  font-family: var(--sans);
  font-size: 22px;
  line-height: 1.4;
  letter-spacing: -.02em;
}

p {
  margin: 0;
}

.hint {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.sound-preview { display: flex; flex-wrap: wrap; gap: 10px; padding: 0 0 20px; }
.sound-preview .btn { font-size: 12px; }

.preferences {
  border-top: 1px solid var(--rule);
}

.preference {
  padding: 20px 0;
  border-bottom: 1px solid var(--rule);
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  cursor: pointer;
}

.preference-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.preference-name {
  font-size: 15px;
  font-weight: 600;
}

.volume-row {
  display: grid;
  gap: 8px;
}

.volume-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.volume-value {
  color: var(--felt);
  font-family: var(--mono);
  font-size: 17px;
  font-variant-numeric: tabular-nums;
}

.volume-value span {
  margin-left: 3px;
  font-size: 12px;
}

.muted .volume-value {
  color: var(--muted);
}

input[type="range"] {
  width: 100%;
  height: 44px;
  margin: 0;
  accent-color: var(--felt);
  cursor: pointer;
}

input[type="range"]:disabled {
  opacity: .45;
  cursor: default;
}

input[type="checkbox"] {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  margin: 0;
  accent-color: var(--felt);
  cursor: pointer;
}

.btn {
  min-height: 44px;
  flex-shrink: 0;
}

.close-button {
  background: var(--surface-raised);
}

.sheet-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 22px;
}

.reset-button {
  color: var(--muted);
}

.reset-button:hover {
  color: var(--ink);
}

.reset-notice {
  margin-top: 16px;
  color: var(--felt);
  font-size: 13px;
  line-height: 1.7;
}

button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--felt);
  outline-offset: 4px;
}

@keyframes sheet-enter {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 540px) {
  .sheet {
    width: 100%;
    max-height: calc(100dvh - 24px);
    margin: auto 0 0;
    border-bottom: 0;
    border-radius: 12px 12px 0 0;
  }

  .sheet-content {
    padding: 22px 20px calc(22px + env(safe-area-inset-bottom, 0px));
  }
}

@media (prefers-reduced-motion: reduce) {
  .sheet[open] {
    animation: none;
  }
}
</style>
