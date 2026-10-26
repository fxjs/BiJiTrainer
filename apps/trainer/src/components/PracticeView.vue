<script setup lang="ts">
import type { Card } from '@biji/core'
import type { LaneMove } from '../practice/board'
import { Lane, LANE_NAME } from '@biji/core'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { usePracticeStore } from '../stores/practice'
import LaneRow from './LaneRow.vue'
import PlayingCard from './PlayingCard.vue'
import ResultPanel from './ResultPanel.vue'

const practice = usePracticeStore()
const { pool, lanes, foul, complete, selected, phase, result, error, sortMode, source } = storeToRefs(practice)

const arranging = computed(() => phase.value === 'arranging')

// 台面显示顺序：头道在上，尾道在下
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
    return foul.value.any ? '可以提交，但会按倒水结算；可用 ↑↓ 整道换位' : '三道已摆满，可以提交'
  return '点选手牌，再点某一道放入；横向滑过多张可连续选择；点道内的牌撤回'
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
  <div class="practice">
    <p v-if="source.kind === 'review' && phase !== 'result'" class="review-note">
      错题复习：花色已做同色置换
    </p>
    <div class="table">
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
      <p class="status" :class="{ bad: foul.any }" aria-live="polite">
        {{ foulText || hint }}
      </p>
    </div>

    <template v-if="phase !== 'result'">
      <div
        ref="poolEl"
        class="pool"
        :class="{ empty: pool.length === 0 }"
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
      </div>

      <div class="bar">
        <button
          type="button"
          class="btn"
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
          {{ phase === 'evaluating' ? '模拟中…' : '提交' }}
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
      @retry="practice.retry()"
      @next="practice.newHand()"
    />
  </div>
</template>

<style scoped>
.practice {
  display: grid;
  gap: 14px;
}

.review-note {
  margin: 0;
  font-size: 13px;
  color: var(--v-minor);
}

.table {
  background: var(--table);
  border-radius: 14px;
  padding: 10px 8px 6px;
  display: grid;
  gap: 4px;
}

.status {
  margin: 2px 10px 4px;
  font-size: 13px;
  color: var(--table-muted);
}

.status.bad {
  color: #F0A095;
}

.pool {
  display: flex;
  gap: 4px;
  justify-content: center;
  /* 横向滑动用于连续选牌，纵向仍交给页面滚动 */
  touch-action: pan-y;
  /* 选中的牌上移 8px，预留空间避免被裁切 */
  padding-top: 10px;
  min-height: calc(min(52px, calc((min(100vw, 520px) - 64px) / 9)) * 1.4 + 10px);
}

.pool.empty::before {
  content: "手牌已全部摆入三道";
  align-self: center;
  font-size: 13px;
  color: var(--muted);
}

.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.bar .submit {
  margin-left: auto;
  min-width: 6em;
}

.error {
  margin: 0;
  color: var(--v-mistake);
  font-size: 13px;
}
</style>
