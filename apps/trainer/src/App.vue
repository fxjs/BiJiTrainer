<script setup lang="ts">
import type { MistakeItem } from './review/srs'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AccountPanel from './components/AccountPanel.vue'
import MistakeBook from './components/MistakeBook.vue'
import PracticeView from './components/PracticeView.vue'
import SettingsSheet from './components/SettingsSheet.vue'
import StatsView from './components/StatsView.vue'
import { useAuthStore } from './stores/auth'
import { usePracticeStore } from './stores/practice'
import { useRecordsStore } from './stores/records'
import { useSettingsStore } from './stores/settings'
import { sound } from './sound'

useSettingsStore()
const auth = useAuthStore()
const practice = usePracticeStore()
const records = useRecordsStore()
const { stats } = storeToRefs(practice)
const { dueMistakes } = storeToRefs(records)
const settingsOpen = ref(false)

type Tab = 'practice' | 'mistakes' | 'stats' | 'account'
const tab = ref<Tab>('practice')
const TABS: { id: Tab, label: string }[] = [
  { id: 'practice', label: '配牌训练' },
  { id: 'mistakes', label: '错题本' },
  { id: 'stats', label: '训练统计' },
  { id: 'account', label: '我的名号' },
]
const dataBusy = computed(() => records.saving || records.pendingSave || practice.phase === 'evaluating')
const summary = computed(() => {
  const s = stats.value
  if (!auth.identity)
    return ''
  if (s.hands === 0)
    return '本次尚未提交 · 随时开始下一手'
  return `本次 ${s.hands} 手 · 最优 ${Math.round((s.best / s.hands) * 100)}% · 平均损失 ${(s.evLossSum / s.hands).toFixed(1)} 分`
})
const cloudStatus = computed(() => {
  if (records.loading)
    return '读取云端中'
  if (records.saving)
    return '正在保存'
  if (records.pendingSave)
    return '有结果待保存'
  if (records.error)
    return '云端操作未完成'
  return records.ready ? '云端已连接' : '我的名号'
})

function review(item: MistakeItem) {
  if (dataBusy.value)
    return
  practice.startReview(item)
  tab.value = 'practice'
}

function selectTab(next: Tab) {
  if (tab.value === next)
    return
  tab.value = next
  sound.play('ui')
}

watch([() => auth.user?.id ?? null, () => auth.identity?.id ?? null], ([, characterId]) => {
  practice.resetSession()
  tab.value = 'practice'
  void records.init(characterId)
}, { immediate: true })

// iOS Safari 只允许在用户手势内启动音频。
const unlock = () => sound.unlock()
onMounted(() => {
  document.addEventListener('pointerdown', unlock, { capture: true, passive: true })
  document.addEventListener('keydown', unlock, { capture: true, passive: true })
  void auth.init()
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', unlock, { capture: true })
  document.removeEventListener('keydown', unlock, { capture: true })
})
</script>

<template>
  <div class="app">
    <header class="top">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">♠</span>
        <div class="brand-copy">
          <h1>比鸡配牌训练</h1>
          <p v-if="auth.identity" class="sub">{{ summary }}</p>
        </div>
      </div>
      <div class="top-actions">
        <button
          v-if="auth.identity"
          type="button"
          class="cloud-button"
          :class="{ warning: records.error || records.pendingSave }"
          @click="selectTab('account')"
        >
          <span class="cloud-dot" aria-hidden="true" />
          {{ cloudStatus }}
        </button>
        <button type="button" class="btn settings-button" aria-haspopup="dialog" @click="settingsOpen = true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
            <path d="M4 7h16M4 17h16" />
            <circle cx="9" cy="7" r="3" fill="var(--surface)" />
            <circle cx="15" cy="17" r="3" fill="var(--surface)" />
          </svg>
          设置
        </button>
      </div>
    </header>

    <nav v-if="auth.ready && auth.identity" class="tabs" aria-label="页面">
      <button
          v-for="t in TABS"
          :key="t.id"
          type="button"
          :class="{ active: tab === t.id }"
          :aria-current="tab === t.id ? 'page' : undefined"
          :disabled="practice.phase === 'evaluating'"
          @click="selectTab(t.id)"
      >
        {{ t.label }}
        <span v-if="t.id === 'mistakes' && dueMistakes.length" class="badge num">{{ dueMistakes.length }}</span>
      </button>
    </nav>

    <main>
      <div v-if="!auth.ready" class="loading-state" role="status">
        <span class="loading-mark" aria-hidden="true">♠</span>
        <p>正在连接…</p>
      </div>
      <AccountPanel v-else-if="!auth.identity" :data-busy="dataBusy" />
      <template v-else>
        <div v-if="records.error" class="storage-alert" role="alert">
          <div>
            <strong>{{ records.pendingSave ? '本次结果尚未保存到云端' : '云端操作未完成' }}</strong>
            <p>{{ records.error }}</p>
            <p v-if="records.pendingSave">请保留此页面并重试保存，成功后再开始下一手。</p>
          </div>
          <button v-if="records.pendingSave" type="button" class="btn" :disabled="records.saving" @click="records.retrySave()">
            重试保存
          </button>
          <button v-else type="button" class="btn" :disabled="records.loading || records.saving" @click="records.reload()">
            重新加载
          </button>
        </div>
        <AccountPanel v-if="tab === 'account'" :data-busy="dataBusy" />
        <div v-else-if="records.loading" class="loading-state" role="status">
          <span class="loading-mark" aria-hidden="true">♠</span>
          <p>正在加载你的云端记录…</p>
        </div>
        <template v-else-if="records.ready">
          <!-- v-show 保留切换页面前尚未摆完的台面。 -->
          <PracticeView v-show="tab === 'practice'" />
          <MistakeBook v-if="tab === 'mistakes'" @review="review" />
          <StatsView v-if="tab === 'stats'" />
        </template>
        <p v-if="records.saving" class="save-state" role="status">正在保存到云端，请稍候…</p>
      </template>
    </main>

    <footer v-if="auth.identity" class="app-footer">
      <span>六人比鸡 · 54 张牌 · 三道取舍</span>
      <span>本地计算策略，云端保存进度</span>
    </footer>
    <SettingsSheet v-model:open="settingsOpen" />
  </div>
</template>

<style scoped>
.app {
  max-width: 1000px;
  margin-inline: auto;
  padding: calc(28px + env(safe-area-inset-top, 0px)) 28px calc(24px + env(safe-area-inset-bottom, 0px));
  display: grid;
  gap: 24px;
  min-width: 0;
}
.top, .brand, .top-actions { display: flex; align-items: center; }
.top { justify-content: space-between; gap: 20px; }
.brand { gap: 14px; min-width: 0; }
.brand-mark {
  display: grid;
  place-items: center;
  flex: 0 0 48px;
  width: 48px;
  height: 54px;
  border-radius: 10px;
  background: var(--gold);
  color: var(--ground);
  font-family: var(--serif);
  font-size: 36px;
  transform: rotate(-7deg);
}
.brand-copy { min-width: 0; }
h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -.025em; }
.sub { margin: 3px 0 0; font-size: 12px; color: var(--muted); }
.top-actions { flex-shrink: 0; gap: 10px; }
.settings-button { display: inline-flex; gap: 7px; align-items: center; }
.cloud-button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 44px;
  padding: 8px;
  background: none;
  border: 0;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}
.cloud-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--felt); }
.cloud-button.warning { color: var(--gold); }
.cloud-button.warning .cloud-dot { background: var(--gold); }
.tabs {
  display: flex;
  gap: 6px;
  padding: 5px;
  border: 1px solid var(--rule);
  border-radius: 12px;
  background: var(--surface);
}
.tabs button {
  flex: 1;
  min-height: 44px;
  padding: 9px 14px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--muted);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--motion-fast), background-color var(--motion-fast);
}
.tabs button.active { background: var(--felt-soft); color: var(--felt); }
.tabs button:disabled { opacity: .5; cursor: wait; }
.badge { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 4px; margin-left: 4px; border-radius: 9px; background: var(--gold); color: var(--ground); font-size: 10px; }
main { min-width: 0; }
.loading-state { display: grid; place-items: center; align-content: center; min-height: 300px; gap: 12px; color: var(--muted); }
.loading-mark { font-size: 42px; color: var(--gold); }
.loading-state p { margin: 0; }
.storage-alert { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; margin-bottom: 20px; padding: 16px 18px; border: 1px solid var(--v-minor); border-radius: 12px; background: var(--surface); }
.storage-alert strong { color: var(--gold); }
.storage-alert p { margin: 4px 0 0; overflow-wrap: anywhere; font-size: 13px; }
.save-state { color: var(--gold); font-size: 13px; text-align: center; }
.app-footer { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px 20px; padding-top: 10px; color: var(--muted); font-size: 11px; }
@media (hover: hover) {
  .tabs button:not(:disabled):not(.active):hover { background: var(--surface-raised); color: var(--ink); }
  .cloud-button:hover { color: var(--ink); }
}
@media (max-width: 600px) {
  .app { padding: calc(18px + env(safe-area-inset-top, 0px)) 16px calc(20px + env(safe-area-inset-bottom, 0px)); gap: 18px; }
  .top { align-items: flex-start; gap: 10px; }
  .brand { gap: 10px; }
  .brand-mark { flex-basis: 36px; width: 36px; height: 44px; font-size: 29px; border-radius: 7px; }
  h1 { font-size: 19px; }
  .sub { max-width: 30ch; font-size: 11px; }
  .top-actions { flex-direction: column-reverse; align-items: flex-end; gap: 0; }
  .settings-button { padding: 8px 10px; min-height: 40px; font-size: 12px; }
  .cloud-button { min-height: 30px; padding: 5px 0; font-size: 10px; }
  .tabs { gap: 2px; padding: 4px; }
  .tabs button { padding: 9px 5px; font-size: 12px; }
  .badge { margin-left: 1px; min-width: 15px; height: 15px; }
  .app-footer { font-size: 10px; }
}
</style>
