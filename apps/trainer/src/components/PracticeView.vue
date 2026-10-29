<script setup lang="ts">
import type { Card } from '@biji/core'
import type { LaneMove } from '../practice/board'
import { Lane, LANE_NAME } from '@biji/core'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { usePracticeStore } from '../stores/practice'
import { useRecordsStore } from '../stores/records'
import LaneRow from './LaneRow.vue'
import PlayingCard from './PlayingCard.vue'
import ResultPanel from './ResultPanel.vue'

const practice = usePracticeStore()
const records = useRecordsStore()
const { pool, lanes, foul, complete, selected, phase, result, error, sortMode, source } = storeToRefs(practice)

const arranging = computed(() => phase.value === 'arranging')

// 台面显示顺序：竖屏从上到下，横屏从左到右
const order: Lane[] = [Lane.Head, Lane.Middle, Lane.Tail]

/** 与某一道相关的倒水标记 */
function laneFoul(l: Lane): boolean {
  const f = foul.value
  if (l === Lane.Tail)
    return f.tailMid || f.tailHead
  if (l === Lane.Middle)
    return f.tailMid || f.midHead
  return f.midHead || f.tailHead
}

const foulText = computed(() => {
  const f = foul.value
  if (f.tailMid)
    return '倒水：尾道小于中道'
  if (f.midHead)
    return '倒水：中道小于头道'
  if (f.tailHead)
    return '倒水：尾道小于头道，中道无论怎么摆都会倒水'
  return ''
})

function toggleSort() {
  sortMode.value = sortMode.value === 'suit' ? 'rank' : 'suit'
}

const hint = computed(() => {
  if (selected.value.length > 0)
    return `已选 ${selected.value.length} 张，点某一道放入`
  if (complete.value)
    return foul.value.any ? '可以提交，但会按倒水结算；可用箭头整道换位' : '三道已摆满，可以提交'
  return '选牌后点一道放入；点道内的牌撤回'
})

/** 倒水时整道换位：+1 向头道，−1 向尾道 */
function moveLane(l: Lane, dir: LaneMove) {
  practice.move(l, dir)
}

const poolEl = ref<HTMLElement | null>(null)

interface DragSelect {
  pointerId: number
  startX: number
  startY: number
  startCard: Card
  /** 起手牌未选中则一路选中，已选中则一路取消 */
  select: boolean
  touched: Set<Card>
  dragging: boolean
}

let dragSelect: DragSelect | null = null
/** 拖动结束后浏览器仍会补发一次 click，需要忽略它，避免把刚选中的牌又取消 */
let ignoreClick = false

/** 指针下的手牌；落在手牌区之外返回 null */
function cardAt(x: number, y: number): Card | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-card]')
  if (!el || !poolEl.value?.contains(el))
    return null
  const card = Number(el.dataset.card)
  return Number.isInteger(card) ? card : null
}

function applyDrag(d: DragSelect, card: Card) {
  if (d.touched.has(card))
    return
  d.touched.add(card)
  const isSelected = selected.value.includes(card)
  if (isSelected !== d.select)
    practice.select(card, d.select)
}

function onPointerDown(e: PointerEvent) {
  if (!arranging.value || !e.isPrimary)
    return
  const card = cardAt(e.clientX, e.clientY)
  if (card === null)
    return
  dragSelect = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    startCard: card,
    select: !selected.value.includes(card),
    touched: new Set(),
    dragging: false,
  }
}

function onPointerMove(e: PointerEvent) {
  const d = dragSelect
  if (!d || d.pointerId !== e.pointerId)
    return
  if (!d.dragging) {
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    // 只把明显的横向滑动当多选；竖向滑动留给页面滚动
    if (Math.abs(dx) < 6 || Math.abs(dx) <= Math.abs(dy))
      return
    d.dragging = true
    ignoreClick = true
    // 拖动开始后再捕获到整条手牌区，避免点击（tap）被重定向到容器而丢失
    try {
      poolEl.value?.setPointerCapture(e.pointerId)
    }
    catch {
      // 某些浏览器拒绝捕获时仍可按元素自身的 pointermove 继续
    }
    applyDrag(d, d.startCard)
  }
  const card = cardAt(e.clientX, e.clientY)
  if (card !== null)
    applyDrag(d, card)
}

function onPointerUp(e: PointerEvent) {
  const d = dragSelect
  if (!d || d.pointerId !== e.pointerId)
    return
  if (d.dragging) {
    const card = cardAt(e.clientX, e.clientY)
    if (card !== null)
      applyDrag(d, card)
    // click 在 pointerup 之后同步触发，下一轮事件循环再恢复
    setTimeout(() => (ignoreClick = false), 0)
  }
  dragSelect = null
}

function onPointerCancel(e: PointerEvent) {
  if (dragSelect?.pointerId === e.pointerId) {
    dragSelect = null
    setTimeout(() => (ignoreClick = false), 0)
  }
}

/** 点击（含键盘 Enter/Space）选择单张；拖动产生的 click 由 ignoreClick 吞掉 */
function onCardClick(e: MouseEvent, card: Card) {
  if (ignoreClick) {
    ignoreClick = false
    return
  }
  practice.toggle(card)
}
</script>

<template>
  <div class="practice" :class="{ 'showing-result': phase === 'result' }">
    <template v-if="phase !== 'result'">
      <section class="table" aria-label="摆牌桌面" :aria-busy="phase === 'evaluating'">
        <header class="table-heading">
          <h2>摆好三道</h2>
          <span>尾道 ≥ 中道 ≥ 头道</span>
        </header>
        <div class="lanes">
          <LaneRow
            v-for="l in order"
            :key="l"
            :name="LANE_NAME[l]"
            :cards="lanes[l].cards"
            :label="lanes[l].info.label"
            :foul="laneFoul(l)"
            :droppable="arranging && selected.length > 0 && lanes[l].cards.length < 3"
            :disabled="!arranging"
            :can-move-up="arranging && lanes[l].cards.length > 0 && l < Lane.Head"
            :can-move-down="arranging && lanes[l].cards.length > 0 && l > Lane.Tail"
            @place="practice.place(l)"
            @remove="(c) => practice.unplace(l, c)"
            @move="(dir) => moveLane(l, dir)"
          />
        </div>
        <p id="practice-status" class="status" :class="{ bad: foul.any }" aria-live="polite">
          <span v-if="source.kind === 'review'" class="review-note">复习 · 同色置换 · </span>
          {{ phase === 'evaluating' ? '正在模拟对局，分析这手牌…' : foulText || hint }}
        </p>
      </section>

      <section class="hand" aria-label="待摆手牌">
        <div class="hand-heading">
          <h3>{{ source.kind === 'review' ? '复习手牌' : '手牌' }} <span>{{ pool.length }} 张</span></h3>
          <span class="selection-count" :class="{ active: selected.length > 0 }">
            {{ selected.length > 0 ? `已选 ${selected.length} 张` : '点选或横滑多选' }}
          </span>
        </div>
        <div
          ref="poolEl"
          class="pool"
          :class="{ empty: pool.length === 0 }"
          aria-describedby="practice-status"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerCancel"
        >
          <PlayingCard
            v-for="c in pool"
            :key="c"
            :card="c"
            :data-card="c"
            size="md"
            :selected="selected.includes(c)"
            :interactive="arranging"
            @click="(e: MouseEvent) => onCardClick(e, c)"
          />
          <p v-if="pool.length === 0" class="pool-empty">手牌已全部摆入三道</p>
        </div>
      </section>

      <div class="bar">
        <button
          type="button"
          class="btn sort"
          :disabled="!arranging"
          @click="toggleSort"
        >
          按{{ sortMode === 'suit' ? '点数' : '花色' }}排
        </button>
        <button type="button" class="btn" :disabled="!arranging" @click="practice.clear()">
          清空
        </button>
        <button type="button" class="btn" :disabled="!arranging" @click="practice.newHand()">
          换一手
        </button>
        <button
          type="button"
          class="btn primary submit"
          :disabled="!arranging || !complete"
          @click="practice.submit()"
        >
          {{ phase === 'evaluating' ? '模拟中…' : '提交摆牌' }}
        </button>
      </div>
      <p v-if="error" class="error" role="alert">
        评估失败：{{ error }}
      </p>
    </template>

    <ResultPanel
      v-else-if="result"
      :result="result"
      :source="source.kind"
      :blocked="records.saving || records.pendingSave"
      @retry="practice.retry()"
      @next="practice.newHand()"
    />
  </div>
</template>

<style scoped>
.practice {
  --lane-card-width: clamp(44px, min(6.5dvh, calc((100vw - 196px) / 3)), 58px);
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: 12px;
}

.review-note {
  color: var(--gold);
}

.table {
  flex: 1;
  display: grid;
  grid-template-rows: auto minmax(min-content, 1fr) auto;
  min-width: 0;
  padding: 12px;
  background: var(--table);
  border-radius: 12px;
  color: var(--table-ink);
}

.table-heading,
.hand-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.table-heading {
  margin: 0 4px 8px;
}

.table-heading h2,
.hand-heading h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
}

.table-heading > span {
  color: var(--table-muted);
  font-size: 12px;
}

.lanes {
  display: grid;
  align-content: stretch;
  gap: 8px;
}

/* The head cannot move up and the tail cannot move down. */
.lanes > :first-child :deep(.move-btn:first-child),
.lanes > :last-child :deep(.move-btn:last-child) {
  display: none;
}

.status {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  align-content: center;
  margin: 8px 4px 0;
  padding-block: 4px;
  border-top: 1px solid var(--rule);
  /* Reserve two centered lines so selection and foul feedback never move the hand. */
  min-height: calc(2.8em + 9px);
  text-align: center;
  color: var(--table-muted);
  font-size: 12px;
  line-height: 1.4;
  text-wrap: pretty;
}

.status.bad {
  color: var(--red);
}

.hand {
  flex: none;
  min-width: 0;
  container-type: inline-size;
}

.hand-heading {
  margin-bottom: 4px;
}

.hand-heading h3 span {
  margin-left: 6px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

.selection-count {
  color: var(--muted);
  font-size: 12px;
}

.selection-count.active {
  color: var(--gold);
}

.pool {
  --hand-card-width: min(clamp(44px, 7dvh, 56px), calc((100cqw - 32px) / 9));
  --hand-card-height: max(44px, calc(var(--hand-card-width) * var(--card-aspect, 1.4)));
  display: grid;
  grid-template-columns: repeat(9, var(--hand-card-width));
  grid-auto-rows: var(--hand-card-height);
  justify-content: center;
  align-content: start;
  gap: 4px;
  min-height: calc(var(--hand-card-height) + 48px);
  padding: 24px 0;
  /* Horizontal gestures select cards; vertical gestures remain native. */
  touch-action: pan-y;
  user-select: none;
}

.pool.empty {
  display: flex;
  align-items: center;
}

.pool-empty {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.bar {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.bar .btn {
  min-height: 44px;
}

.bar .submit {
  margin-left: auto;
  min-width: 132px;
}

.error {
  margin: 0;
  color: var(--red);
  font-size: 13px;
}


@media (max-width: 600px), (max-height: 500px) {
  .bar {
    display: grid;
    grid-template-columns: minmax(60px, 1.1fr) minmax(44px, .7fr) minmax(50px, 1fr) minmax(60px, 1.25fr);
    gap: 6px;
  }

  .bar .submit {
    min-width: 0;
    margin-left: 0;
  }

  .bar .btn {
    padding: 8px 4px;
    font-size: 12px;
    white-space: nowrap;
  }

}

@media (max-height: 740px) {
  .practice { --lane-card-width: 44px; gap: 8px; }
  .table { padding: 6px; grid-template-rows: minmax(min-content, 1fr) auto; }
  .table-heading { display: none; }
  .status { margin: 4px 0 0; }
  .hand-heading h3 { font-size: 14px; }
}

@media (min-width: 560px) and (orientation: landscape) {
  .practice {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 192px;
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas: 'table table' 'hand actions';
  }
  .table { grid-area: table; }
  .hand { grid-area: hand; align-self: center; }
  .pool {
    --hand-card-width: min(clamp(44px, 14dvh, 64px), calc((100cqw - 64px) / 9));
    grid-template-columns: repeat(auto-fit, var(--hand-card-width));
    align-content: center;
    min-height: calc(var(--hand-card-height) + 32px);
    padding: 16px;
  }
  .bar { grid-area: actions; grid-template-columns: repeat(2, minmax(0, 1fr)); display: grid; align-self: end; }
  .bar .btn { padding: 8px 4px; font-size: 12px; white-space: nowrap; }
  .bar .submit { min-width: 0; margin-left: 0; }
  .error { grid-column: 1 / -1; }
  .lanes { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .lanes > :deep(.lane) {
    grid-template-columns: minmax(0, 1fr) 88px;
    gap: 4px;
    align-content: center;
    padding: 4px;
  }
  .lanes :deep(.slots) { grid-area: 2 / 1 / 3 / -1; }
  .lanes :deep(.move) { grid-area: 1 / 2; flex-direction: row; justify-content: center; gap: 0; }
  .lanes :deep(.move-arrow) { transform: rotate(-90deg); }
  .lanes :deep(.place-target) { margin-block: -8px; }
  .lanes :deep(.lane.foul .label) { display: none; }
}

@media (min-width: 560px) and (max-height: 500px) {
  .status { min-height: calc(1.4em + 9px); }
}

@media (max-height: 500px) {
  .practice:not(.showing-result) { --card-aspect: 1; }
}

@media (min-width: 560px) and (max-height: 360px) {
  .practice { gap: 4px; }
  .table { padding: 4px; }
  .status { margin-top: 0; }
  .hand-heading { display: none; }
}

@media (max-width: 559px) and (max-height: 550px) {
  .practice:not(.showing-result) { --card-aspect: 1.15; }
  .hand-heading { display: none; }
  .practice { gap: 6px; }
  .pool { min-height: calc(var(--hand-card-height) + 32px); padding: 16px 0; }
}

@media (max-width: 559px) and (max-height: 500px) {
  .practice:not(.showing-result) {
    --card-aspect: 1;
    --card-rank-scale: .36;
    --card-suit-scale: .44;
  }
}

.practice.showing-result { display: flex; }
</style>
