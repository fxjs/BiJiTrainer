import type { Pinia } from 'pinia'
import type { TrainerDB } from '../src/db/trainerDb'
import type { PracticeRecord } from '../src/review/stats'
import type { GradeDTO, ScoredDTO } from '../src/worker/protocol'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRecordsStore } from '../src/stores/records'

const fixtures = vi.hoisted(() => ({ databases: new Map<string, unknown>() }))
vi.mock('../src/lib/supabase', () => ({ supabase: {} }))
vi.mock('../src/db/trainerDb', () => ({
  createTrainerDB: (_client: unknown, userId: string) => fixtures.databases.get(userId),
}))

const hand = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const record: PracticeRecord = {
  id: 1, time: 1, source: 'free', hand,
  player: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
  best: [[1, 4, 7], [2, 5, 8], [3, 6, 9]],
  verdict: 'mistake', evLoss: 8, gap: 8, playerMean: 0, bestMean: 8, tags: ['headWasted'],
}
const scored: ScoredDTO = {
  lanes: record.player, strengths: [1, 2, 3], foul: false, xi: [],
  mean: 0, std: 2, stderr: .1, laneFirst: [0, 0, 0], sweep: 0,
  gap: 8, tableRank: 2, equivalentBest: false,
}
const grade: GradeDTO = {
  verdict: 'mistake', evLoss: 8, gap: 8, player: scored,
  best: { ...scored, lanes: record.best, mean: 8, gap: 0, equivalentBest: true },
  alternatives: [], tags: [{ code: 'headWasted', title: '头道本可以争第一', detail: '头道可提升。' }],
  legalCount: 10, samples: 2000, elapsedMs: 100,
}

function database(overrides: Partial<TrainerDB> = {}): TrainerDB {
  return {
    commitAttempt: async () => 1,
    listRecords: async () => [],
    listMistakes: async () => [],
    deleteMistake: async () => {},
    clear: async () => {},
    ...overrides,
  }
}

let pinia: Pinia
beforeEach(() => {
  fixtures.databases.clear()
  pinia = createPinia()
  setActivePinia(pinia)
})
afterEach(() => disposePinia(pinia))

describe('账号训练数据的异步边界', () => {
  it('切换账号后，较晚返回的旧账号数据不能覆盖新账号', async () => {
    const oldHistory = Promise.withResolvers<PracticeRecord[]>()
    fixtures.databases.set('a', database({ listRecords: () => oldHistory.promise }))
    fixtures.databases.set('b', database({ listRecords: async () => [{ ...record, evLoss: 2 }] }))
    const store = useRecordsStore()
    const oldLoad = store.init('a')
    await store.init('b')
    oldHistory.resolve([record])
    await oldLoad
    expect(store.accountId).toBe('b')
    expect(store.summary.avgLoss).toBe(2)
    expect(store.ready).toBe(true)
  })

  it('旧账号的保存回执不能把牌面或错题带入新账号', async () => {
    const receipt = Promise.withResolvers<number>()
    fixtures.databases.set('a', database({ commitAttempt: () => receipt.promise }))
    fixtures.databases.set('b', database({ listRecords: async () => [{ ...record, evLoss: 3 }] }))
    const store = useRecordsStore()
    await store.init('a')
    const oldSave = store.save(grade, hand, { kind: 'free' })
    await store.init('b')
    receipt.resolve(11)
    await oldSave
    expect(store.accountId).toBe('b')
    expect(store.summary.hands).toBe(1)
    expect(store.summary.avgLoss).toBe(3)
    expect(store.mistakes).toEqual([])
    expect(store.pendingSave).toBe(false)
  })

  it('保存失败不伪报成功，重试成功后练习与错题同时进入视图', async () => {
    let unavailable = true
    fixtures.databases.set('a', database({ commitAttempt: async () => {
      if (unavailable)
        throw new Error('网络连接中断')
      return 7
    } }))
    const store = useRecordsStore()
    await store.init('a')
    await store.save(grade, hand, { kind: 'free' })
    expect(store.pendingSave).toBe(true)
    expect(store.error).toBe('网络连接中断')
    expect(store.summary.hands).toBe(0)
    expect(store.mistakes).toEqual([])
    unavailable = false
    await store.retrySave()
    expect(store.pendingSave).toBe(false)
    expect(store.error).toBeNull()
    expect(store.summary.hands).toBe(1)
    expect(store.summary.avgLoss).toBe(8)
    expect(store.mistakes[0].lastEvLoss).toBe(8)
    await store.retrySave()
    expect(store.summary.hands).toBe(1)
  })
})
