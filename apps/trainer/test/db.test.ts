import type { TrainerDB } from '../src/db/trainerDb'
import type { PracticeRecord } from '../src/review/stats'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { createMemoryDB, openTrainerDB } from '../src/db/trainerDb'
import { recordMistake } from '../src/review/srs'

const record: PracticeRecord = {
  time: 1,
  source: 'free',
  hand: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  player: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
  best: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
  verdict: 'mistake',
  evLoss: 5,
  gap: 5,
  playerMean: 1,
  bestMean: 6,
  lambda: 0.1,
  tags: ['headWasted'],
}

async function exercise(db: TrainerDB) {
  const id = await db.addRecord(record)
  expect(id).toBeGreaterThan(0)
  const list = await db.listRecords()
  expect(list).toHaveLength(1)
  expect(list[0].tags).toEqual(['headWasted'])

  const m = recordMistake(undefined, record.hand, 'mistake', 5, [], 0)
  await db.putMistake(m)
  expect((await db.getMistake(m.id))?.box).toBe(0)
  await db.putMistake({ ...m, box: 2 })
  expect((await db.listMistakes()).map(x => x.box)).toEqual([2])
  await db.deleteMistake(m.id)
  expect(await db.listMistakes()).toEqual([])

  await db.clear()
  expect(await db.listRecords()).toEqual([])
}

describe('持久化', () => {
  it('IndexedDB', async () => {
    const db = await openTrainerDB(new IDBFactory())
    expect(db.persistent).toBe(true)
    await exercise(db)
  })

  it('内存退化实现行为一致', async () => {
    const db = createMemoryDB()
    expect(db.persistent).toBe(false)
    await exercise(db)
  })

  it('没有 IndexedDB 时退化为内存', async () => {
    const db = await openTrainerDB(undefined)
    expect(db.persistent).toBe(false)
  })
})
