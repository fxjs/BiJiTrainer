import type { MistakeChange, TrainerDB } from '../db/trainerDb'
import type { MistakeItem } from '../review/srs'
import type { PracticeRecord } from '../review/stats'
import type { GradeDTO } from '../worker/protocol'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { createTrainerDB } from '../db/trainerDb'
import { supabase } from '../lib/supabase'
import { handKey, isDue, recordMistake, recordReview } from '../review/srs'
import { summarize, trend } from '../review/stats'

/** 看过答案后的重摆不计入训练记录。 */
export type PracticeSource = { kind: 'free' } | { kind: 'review', id: string } | { kind: 'retry' }

interface PendingAttempt {
  record: PracticeRecord
  change: MistakeChange
  key: string
}

function message(e: unknown): string {
  if (e && typeof e === 'object' && 'code' in e && (e.code === 'PGRST205' || e.code === 'PGRST202'))
    return '云端数据表尚未初始化，请先执行 supabase/migrations 中的 SQL。'
  return e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e)
}

export const useRecordsStore = defineStore('records', () => {
  const db = shallowRef<TrainerDB | null>(null)
  const accountId = ref<string | null>(null)
  const ready = ref(false)
  const loading = ref(false)
  const saving = ref(false)
  const pending = shallowRef<PendingAttempt | null>(null)
  const records = ref<PracticeRecord[]>([])
  const mistakes = ref<MistakeItem[]>([])
  const error = ref<string | null>(null)
  let generation = 0
  const now = ref(Date.now())
  const clock = setInterval(() => (now.value = Date.now()), 60_000)
  onScopeDispose(() => clearInterval(clock))

  const summary = computed(() => summarize(records.value))
  const recent = computed(() => summarize([...records.value].sort((a, b) => b.time - a.time).slice(0, 50)))
  const trendRows = computed(() => trend(records.value, 20))
  const dueMistakes = computed(() =>
    mistakes.value.filter(m => isDue(m, now.value)).sort((a, b) => a.due - b.due))
  const pendingSave = computed(() => pending.value !== null)

  /** 名号切换先清空视图；过期请求不能重新填入前一人物的数据。 */
  async function init(characterId: string | null, force = false) {
    if (!force && accountId.value === characterId && (ready.value || loading.value))
      return
    const version = ++generation
    accountId.value = characterId
    db.value = null
    ready.value = false
    loading.value = characterId !== null
    saving.value = false
    pending.value = null
    records.value = []
    mistakes.value = []
    error.value = null
    if (!characterId)
      return
    try {
      if (!supabase)
        throw new Error('Supabase 尚未配置。')
      const next = createTrainerDB(supabase, characterId)
      const [history, book] = await Promise.all([next.listRecords(), next.listMistakes()])
      if (version !== generation)
        return
      db.value = next
      records.value = history
      mistakes.value = book
      ready.value = true
    }
    catch (e) {
      if (version === generation)
        error.value = message(e)
    }
    finally {
      if (version === generation)
        loading.value = false
    }
  }

  async function reload() {
    if (!saving.value && !pending.value)
      await init(accountId.value, true)
  }

  async function retrySave() {
    const attempt = pending.value
    const target = db.value
    if (!attempt || !target || saving.value)
      return
    const version = generation
    saving.value = true
    error.value = null
    try {
      const id = await target.commitAttempt(attempt.record, attempt.change, attempt.key)
      if (version !== generation)
        return
      records.value.push({ ...attempt.record, id })
      const change = attempt.change
      if (change && 'put' in change)
        mistakes.value = [...mistakes.value.filter(m => m.id !== change.put.id), change.put]
      else if (change && 'delete' in change)
        mistakes.value = mistakes.value.filter(m => m.id !== change.delete)
      pending.value = null
    }
    catch (e) {
      if (version === generation)
        error.value = message(e)
    }
    finally {
      if (version === generation)
        saving.value = false
    }
  }

  /** 一次练习和相应错题进度在服务端同一事务中提交，重试使用原键避免重复。 */
  async function save(result: GradeDTO, hand: number[], source: PracticeSource) {
    if (source.kind === 'retry')
      return
    if (!ready.value || !db.value)
      throw new Error('请先登录并加载云端数据。')
    if (pending.value || saving.value)
      throw new Error('上一手尚未保存，请先重试保存。')
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
    let change: MistakeChange = null
    if (source.kind === 'review') {
      const item = mistakes.value.find(m => m.id === source.id)
      if (item) {
        const next = recordReview(item, result.verdict, result.evLoss, record.tags, t)
        change = next ? { put: next } : { delete: item.id }
      }
    }
    else if (result.verdict === 'mistake' || result.verdict === 'foul') {
      const existing = mistakes.value.find(m => m.id === handKey(hand))
      change = { put: recordMistake(existing, hand, result.verdict, result.evLoss, record.tags, t) }
    }
    pending.value = { record, change, key: crypto.randomUUID() }
    await retrySave()
  }

  async function removeMistake(id: string) {
    const target = db.value
    if (!target || saving.value || pending.value)
      return
    const version = generation
    saving.value = true
    error.value = null
    try {
      await target.deleteMistake(id)
      if (version === generation)
        mistakes.value = mistakes.value.filter(m => m.id !== id)
    }
    catch (e) {
      if (version === generation)
        error.value = message(e)
    }
    finally {
      if (version === generation)
        saving.value = false
    }
  }

  async function clearAll() {
    const target = db.value
    if (!target || saving.value || pending.value)
      return
    const version = generation
    saving.value = true
    error.value = null
    try {
      await target.clear()
      if (version === generation) {
        records.value = []
        mistakes.value = []
      }
    }
    catch (e) {
      if (version === generation)
        error.value = message(e)
    }
    finally {
      if (version === generation)
        saving.value = false
    }
  }

  return {
    accountId, ready, loading, saving, pendingSave, records, mistakes, error,
    summary, recent, trendRows, dueMistakes,
    init, reload, save, retrySave, removeMistake, clearAll,
  }
})
