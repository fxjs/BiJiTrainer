<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import PracticeView from './components/PracticeView.vue'
import SettingsSheet from './components/SettingsSheet.vue'
import { usePracticeStore } from './stores/practice'
import { useSettingsStore } from './stores/settings'
import { sound } from './sound'

// 提前创建 settings store，使音效选项在首次播放前同步
useSettingsStore()
const { stats } = storeToRefs(usePracticeStore())
const settingsOpen = ref(false)

const summary = computed(() => {
  const s = stats.value
  if (s.hands === 0)
    return '本次尚未提交'
  const bestRate = Math.round((s.best / s.hands) * 100)
  return `${s.hands} 手 · 最优 ${bestRate}% · 平均损失 ${(s.evLossSum / s.hands).toFixed(1)} 分`
})

// iOS Safari 只允许在用户手势内启动音频，每次手势都尝试解锁（已解锁时无开销）
const unlock = () => sound.unlock()
onMounted(() => document.addEventListener('pointerdown', unlock, { capture: true, passive: true }))
onBeforeUnmount(() => document.removeEventListener('pointerdown', unlock, { capture: true }))
</script>

<template>
  <div class="app">
    <header class="top">
      <div>
        <h1>比鸡配牌训练</h1>
        <p class="sub num">
          {{ summary }}<template v-if="stats.streak > 1">
            · 连续最优 {{ stats.streak }}
          </template>
        </p>
      </div>
      <button type="button" class="btn" aria-haspopup="dialog" @click="settingsOpen = true">
        设置
      </button>
    </header>

    <main>
      <PracticeView />
    </main>

    <SettingsSheet v-model:open="settingsOpen" />
  </div>
</template>

<style scoped>
.app {
  max-width: 520px;
  margin-inline: auto;
  padding: calc(12px + env(safe-area-inset-top, 0px)) 16px calc(24px + env(safe-area-inset-bottom, 0px));
  display: grid;
  gap: 12px;
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

h1 {
  margin: 0;
  font-family: var(--serif);
  font-size: 20px;
  font-weight: 900;
}

.sub {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
</style>
