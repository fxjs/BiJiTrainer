import type { TrainerDB } from '../db/trainerDb'
import type { MistakeItem } from '../review/srs'
import type { PracticeRecord } from '../review/stats'
import type { GradeDTO } from '../worker/protocol'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { createMemoryDB, openTrainerDB } from '../db/trainerDb'
import { handKey, isDue, recordMistake, recordReview } from '../review/srs'
import { summarize, trend } from '../review/stats'

/**
 * 练习来源：自由练习；复习错题本中的某一手（id 为原始手牌键）；
 * 看过推荐摆法后重摆同一手（retry），不计入记录与错题本。
 */
export type PracticeSource = { kind: 'free' } | { kind: 'review', id: string } | { kind: 'retry' }

/** 进入错题本的评级 */
const MISTAKE_VERDICTS = new Set(['mistake', 'foul'])

export const useRecordsStore = defineStore('records', () => {
  const db = shallowRef<TrainerDB>(createMemoryDB())
  const ready = ref(false)
  const records = ref<PracticeRecord[]>([])
  const mistakes = ref<MistakeItem[]>([])
  const error = ref<string | null>(null)
  /** 每分钟刷新一次，使"到期"计数随时间更新 */
  const now = ref(Date.now())
  setInterval(() => (now.value = Date.now()), 60_000)

  const summary = computed(() => summarize(records.value))
  const recent = computed(() => summarize([...records.value].sort((a, b) => b.time - a.time).slice(0, 50)))
  const trendRows = computed(() => trend(records.value, 20))
  const dueMistakes = computed(() =>
    mistakes.value.filter(m => isDue(m, now.value)).sort((a, b) => a.due - b.due))

  async function init() {
    if (ready.value)
      return
    try {
      db.value = await openTrainerDB()
      records.value = await db.value.listRecords()
      mistakes.value = await db.value.listMistakes()
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
    ready.value = true
  }

  /** 保存一次评估结果，并更新错题本 */
  async function save(result: GradeDTO, hand: number[], source: PracticeSource) {
    if (source.kind === 'retry')
      return
    const t = Date.now()
    now.value = t
    const record: PracticeRecord = {
      time: t,
      source: source.kind,
      hand,
      player: result.player.lanes,
      best: result.best.lanes,
      verdict: result.verdict,
      evLoss: result.evLoss,
      gap: result.gap,
      playerMean: result.player.mean,
      bestMean: result.best.mean,
      tags: result.tags.map(x => x.code),
    }
    try {
      record.id = await db.value.addRecord(record)
      records.value.push(record)

      if (source.kind === 'review') {
        const item = mistakes.value.find(m => m.id === source.id)
        if (item) {
          const next = recordReview(item, result.verdict, result.evLoss, record.tags, t)
          await (next ? db.value.putMistake(next) : db.value.deleteMistake(item.id))
          mistakes.value = next
            ? mistakes.value.map(m => (m.id === item.id ? next : m))
            : mistakes.value.filter(m => m.id !== item.id)
        }
      }
      else if (MISTAKE_VERDICTS.has(result.verdict)) {
        const existing = mistakes.value.find(m => m.id === handKey(hand))
        const item = recordMistake(existing, hand, result.verdict, result.evLoss, record.tags, t)
        await db.value.putMistake(item)
        mistakes.value = [...mistakes.value.filter(m => m.id !== item.id), item]
      }
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function removeMistake(id: string) {
    await db.value.deleteMistake(id)
    mistakes.value = mistakes.value.filter(m => m.id !== id)
  }

  async function clearAll() {
    await db.value.clear()
    records.value = []
    mistakes.value = []
  }

  return {
    ready,
    error,
    records,
    mistakes,
    summary,
    recent,
    trendRows,
    dueMistakes,
    persistent: computed(() => db.value.persistent),
    init,
    save,
    removeMistake,
    clearAll,
  }
})
