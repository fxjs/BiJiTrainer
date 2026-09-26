<script setup lang="ts">
import type { MistakeItem } from './review/srs'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import MistakeBook from './components/MistakeBook.vue'
import PracticeView from './components/PracticeView.vue'
import SettingsSheet from './components/SettingsSheet.vue'
import StatsView from './components/StatsView.vue'
import { usePracticeStore } from './stores/practice'
import { useRecordsStore } from './stores/records'
import { useSettingsStore } from './stores/settings'
import { sound } from './sound'

// 提前创建 settings store，使音效选项在首次播放前同步
useSettingsStore()
const practice = usePracticeStore()
const records = useRecordsStore()
const { stats } = storeToRefs(practice)
const { dueMistakes } = storeToRefs(records)
const settingsOpen = ref(false)

type Tab = 'practice' | 'mistakes' | 'stats'
const tab = ref<Tab>('practice')
const TABS: { id: Tab, label: string }[] = [
  { id: 'practice', label: '练习' },
  { id: 'mistakes', label: '错题本' },
  { id: 'stats', label: '统计' },
]

function review(item: MistakeItem) {
  practice.startReview(item)
  tab.value = 'practice'
}

const summary = computed(() => {
  const s = stats.value
  if (s.hands === 0)
    return '本次尚未提交'
  const bestRate = Math.round((s.best / s.hands) * 100)
  return `${s.hands} 手 · 最优 ${bestRate}% · 平均损失 ${(s.evLossSum / s.hands).toFixed(1)} 分`
})

// iOS Safari 只允许在用户手势内启动音频，每次手势都尝试解锁（已解锁时无开销）
const unlock = () => sound.unlock()
onMounted(() => {
  document.addEventListener('pointerdown', unlock, { capture: true, passive: true })
  void records.init()
})
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

    <nav class="tabs" aria-label="页面">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        :class="{ active: tab === t.id }"
        :aria-current="tab === t.id ? 'page' : undefined"
        @click="tab = t.id"
      >
        {{ t.label }}
        <span v-if="t.id === 'mistakes' && dueMistakes.length" class="badge num">{{ dueMistakes.length }}</span>
      </button>
    </nav>

    <main>
      <!-- 练习页用 v-show 保留摆到一半的台面 -->
      <PracticeView v-show="tab === 'practice'" />
      <MistakeBook v-if="tab === 'mistakes'" @review="review" />
      <StatsView v-if="tab === 'stats'" />
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

.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--rule);
}

.tabs button {
  position: relative;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 6px 12px 8px;
  color: var(--muted);
  cursor: pointer;
}

.tabs button.active {
  color: var(--ink);
  border-bottom-color: var(--felt);
  font-weight: 600;
}

.badge {
  display: inline-block;
  min-width: 18px;
  padding: 0 5px;
  margin-left: 2px;
  border-radius: 9px;
  background: var(--v-minor);
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

.sub {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
</style>
