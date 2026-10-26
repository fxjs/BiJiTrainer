import type { Card, Lane } from '@biji/core'
import type { Board, SortMode } from '../practice/board'
import type { MistakeItem } from '../review/srs'
import type { GradeDTO } from '../worker/protocol'
import type { PracticeSource } from './records'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { evaluateInWorker } from '../composables/solverClient'
import {
  clearLanes,
  createBoard,
  dealHand,
  foulCheck,
  isComplete,
  laneInfo,
  moveLane,
  placeSelected,
  poolCards,
  removeFromLane,
  setCardSelected,
  toggleSelect,
} from '../practice/board'
import { PERMUTATION_COUNT, permuteSuits } from '../review/permute'
import { sound } from '../sound'
import { useRecordsStore } from './records'

/** 蒙特卡洛采样局数：约 1 秒，均值标准误约 0.2~0.5 分 */
const SAMPLES = 2000

/** arranging 摆牌中；evaluating 等待求解；result 显示评估结果 */
export type Phase = 'arranging' | 'evaluating' | 'result'

export interface SessionStats {
  hands: number
  best: number
  foul: number
  /** 累计期望损失（分） */
  evLossSum: number
  /** 当前连续最优次数 */
  streak: number
}

export const usePracticeStore = defineStore('practice', () => {
  const records = useRecordsStore()

  const board = shallowRef<Board>(createBoard(dealHand()))
  const sortMode = ref<SortMode>('suit')
  const phase = ref<Phase>('arranging')
  const result = shallowRef<GradeDTO | null>(null)
  const error = ref<string | null>(null)
  const stats = ref<SessionStats>({ hands: 0, best: 0, foul: 0, evLossSum: 0, streak: 0 })
  const source = ref<PracticeSource>({ kind: 'free' })

  const pool = computed(() => poolCards(board.value, sortMode.value))
  const lanes = computed(() => ([0, 1, 2] as Lane[]).map(l => ({
    cards: board.value.lanes[l],
    info: laneInfo(board.value, l),
  })))
  const foul = computed(() => foulCheck(board.value))
  const complete = computed(() => isComplete(board.value))
  const selected = computed(() => board.value.selected)

  function update(next: Board): boolean {
    if (next === board.value)
      return false
    board.value = next
    return true
  }

  function newHand() {
    board.value = createBoard(dealHand())
    source.value = { kind: 'free' }
    phase.value = 'arranging'
    result.value = null
    error.value = null
    sound.play('deal')
  }

  /** 复习错题：随机做一次同色花色置换后重新摆 */
  function startReview(item: MistakeItem) {
    const variant = crypto.getRandomValues(new Uint32Array(1))[0] % PERMUTATION_COUNT
    board.value = createBoard(permuteSuits(item.hand, variant))
    source.value = { kind: 'review', id: item.id }
    phase.value = 'arranging'
    result.value = null
    error.value = null
    sound.play('deal')
  }

  /** 同一手牌重新摆：看过推荐摆法后的结果不计入记录、错题本与本次统计 */
  function retry() {
    board.value = clearLanes(board.value)
    source.value = { kind: 'retry' }
    phase.value = 'arranging'
    result.value = null
    error.value = null
  }

  function toggle(card: Card) {
    if (phase.value !== 'arranging')
      return
    if (update(toggleSelect(board.value, card)))
      sound.play('select')
  }

  /** 滑动多选：把一张牌设为选中/未选中，已处于目标状态时不重复播放音效 */
  function select(card: Card, on: boolean) {
    if (phase.value !== 'arranging')
      return
    if (update(setCardSelected(board.value, card, on)))
      sound.play('select')
  }

  /** 整道向头道（+1）或尾道（−1）移动；两道有牌时整体互换 */
  function move(lane: Lane, dir: -1 | 1) {
    if (phase.value !== 'arranging')
      return
    if (update(moveLane(board.value, lane, dir)))
      sound.play('place')
  }

  function place(lane: Lane) {
    if (phase.value !== 'arranging')
      return
    if (update(placeSelected(board.value, lane))) {
      sound.play('place')
      if (complete.value)
        sound.play(foul.value.any ? 'foulWarn' : 'ready')
    }
  }

  function unplace(lane: Lane, card: Card) {
    if (phase.value !== 'arranging')
      return
    if (update(removeFromLane(board.value, lane, card)))
      sound.play('unplace')
  }

  function clear() {
    if (phase.value === 'arranging')
      update(clearLanes(board.value))
  }

  async function submit() {
    if (phase.value !== 'arranging' || !complete.value)
      return
    phase.value = 'evaluating'
    error.value = null
    const b = board.value
    try {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      const r = await evaluateInWorker({
        hand: [...b.hand],
        player: [[...b.lanes[0]], [...b.lanes[1]], [...b.lanes[2]]],
        samples: SAMPLES,
        seed,
      })
      result.value = r
      phase.value = 'result'
      record(r, source.value.kind !== 'retry')
      void records.save(r, [...b.hand], source.value)
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      phase.value = 'arranging'
    }
  }

  /** 播放评级音效；counted 为 false 时（重摆）不计入本次统计与连击 */
  function record(r: GradeDTO, counted: boolean) {
    const s = stats.value
    if (counted) {
      s.hands++
      s.evLossSum += r.evLoss
    }
    if (r.verdict === 'best') {
      sound.play('best', { streak: counted ? s.streak : 0 })
      if (counted) {
        s.best++
        s.streak++
      }
    }
    else {
      if (counted) {
        s.streak = 0
        if (r.verdict === 'foul')
          s.foul++
      }
      sound.play(r.verdict)
    }
    // 玩家本手成喜时，评级音之后再补一声
    if (r.player.xi.length > 0)
      setTimeout(() => sound.play('xi'), 450)
  }

  return {
    board,
    sortMode,
    phase,
    result,
    error,
    stats,
    source,
    pool,
    lanes,
    foul,
    complete,
    selected,
    newHand,
    startReview,
    retry,
    toggle,
    select,
    move,
    place,
    unplace,
    clear,
    submit,
  }
})
