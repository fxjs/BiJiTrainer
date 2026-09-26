import type { MistakeItem } from '../review/srs'
import type { PracticeRecord } from '../review/stats'

/**
 * 训练数据的持久化。IndexedDB 结构（版本 1）：
 * - records   练习记录，自增主键 id，索引 time
 * - mistakes  错题本，主键为手牌规范键 id，索引 due
 * IndexedDB 不可用（隐私模式、被禁用）时退化为内存存储，只在本次会话内有效。
 */
export interface TrainerDB {
  /** false 表示使用内存存储，刷新页面后数据丢失 */
  readonly persistent: boolean
  addRecord: (r: PracticeRecord) => Promise<number>
  listRecords: () => Promise<PracticeRecord[]>
  putMistake: (m: MistakeItem) => Promise<void>
  getMistake: (id: string) => Promise<MistakeItem | undefined>
  deleteMistake: (id: string) => Promise<void>
  listMistakes: () => Promise<MistakeItem[]>
  clear: () => Promise<void>
}

const DB_NAME = 'biji-trainer'
const DB_VERSION = 1
const RECORDS = 'records'
const MISTAKES = 'mistakes'

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function openTrainerDB(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<TrainerDB> {
  if (!factory)
    return createMemoryDB()
  let db: IDBDatabase
  try {
    const open = factory.open(DB_NAME, DB_VERSION)
    open.onupgradeneeded = () => {
      const d = open.result
      if (!d.objectStoreNames.contains(RECORDS))
        d.createObjectStore(RECORDS, { keyPath: 'id', autoIncrement: true }).createIndex('time', 'time')
      if (!d.objectStoreNames.contains(MISTAKES))
        d.createObjectStore(MISTAKES, { keyPath: 'id' }).createIndex('due', 'due')
    }
    db = await req(open)
  }
  catch {
    return createMemoryDB()
  }

  const store = (name: string, mode: IDBTransactionMode) => {
    const tx = db.transaction(name, mode)
    return { tx, os: tx.objectStore(name) }
  }

  return {
    persistent: true,
    async addRecord(r) {
      const { tx, os } = store(RECORDS, 'readwrite')
      const id = await req(os.add(r))
      await done(tx)
      return id as number
    },
    async listRecords() {
      return req(store(RECORDS, 'readonly').os.getAll()) as Promise<PracticeRecord[]>
    },
    async putMistake(m) {
      const { tx, os } = store(MISTAKES, 'readwrite')
      os.put(m)
      await done(tx)
    },
    async getMistake(id) {
      return req(store(MISTAKES, 'readonly').os.get(id)) as Promise<MistakeItem | undefined>
    },
    async deleteMistake(id) {
      const { tx, os } = store(MISTAKES, 'readwrite')
      os.delete(id)
      await done(tx)
    },
    async listMistakes() {
      return req(store(MISTAKES, 'readonly').os.getAll()) as Promise<MistakeItem[]>
    },
    async clear() {
      const tx = db.transaction([RECORDS, MISTAKES], 'readwrite')
      tx.objectStore(RECORDS).clear()
      tx.objectStore(MISTAKES).clear()
      await done(tx)
    },
  }
}

export function createMemoryDB(): TrainerDB {
  const records: PracticeRecord[] = []
  const mistakes = new Map<string, MistakeItem>()
  let nextId = 1
  // 结构化克隆，模拟 IndexedDB 存取时的深拷贝语义
  const clone = <T>(x: T): T => structuredClone(x)
  return {
    persistent: false,
    async addRecord(r) {
      const id = nextId++
      records.push(clone({ ...r, id }))
      return id
    },
    async listRecords() {
      return clone(records)
    },
    async putMistake(m) {
      mistakes.set(m.id, clone(m))
    },
    async getMistake(id) {
      const m = mistakes.get(id)
      return m && clone(m)
    },
    async deleteMistake(id) {
      mistakes.delete(id)
    },
    async listMistakes() {
      return clone([...mistakes.values()])
    },
    async clear() {
      records.length = 0
      mistakes.clear()
    },
  }
}
