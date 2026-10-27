import type { SupabaseClient } from '@supabase/supabase-js'
import type { MistakeItem } from '../review/srs'
import type { PracticeRecord } from '../review/stats'

export type MistakeChange = { put: MistakeItem } | { delete: string } | null

/** 云端是唯一数据源；请求失败必须显式处理，不能退回本机并声称已保存。 */
export interface TrainerDB {
  commitAttempt: (record: PracticeRecord, change: MistakeChange, key: string) => Promise<number>
  listRecords: () => Promise<PracticeRecord[]>
  deleteMistake: (id: string) => Promise<void>
  listMistakes: () => Promise<MistakeItem[]>
  clear: () => Promise<void>
}

const PAGE_SIZE = 1000

/** 捕获人物 UUID，配合成员关系和 RPC 核对，避免切换名号后的旧请求写入新身份。 */
export function createTrainerDB(client: SupabaseClient, characterId: string): TrainerDB {
  return {
    async commitAttempt(record, change, key) {
      const { data, error } = await client.rpc('save_training_attempt', {
        p_character_id: characterId,
        p_key: key,
        p_record: record,
        p_mistake: change && 'put' in change ? change.put : null,
        p_delete_mistake: change && 'delete' in change ? change.delete : null,
      })
      if (error)
        throw error
      return data as number
    },
    async listRecords() {
      const records: PracticeRecord[] = []
      let after: number | undefined
      for (;;) {
        let query = client.from('training_records').select('id,data')
          .eq('character_id', characterId).order('id').limit(PAGE_SIZE)
        if (after !== undefined)
          query = query.gt('id', after)
        const { data, error } = await query
        if (error)
          throw error
        for (const row of data)
          records.push({ ...row.data as PracticeRecord, id: row.id as number })
        if (data.length < PAGE_SIZE)
          return records
        after = data[data.length - 1].id as number
      }
    },
    async listMistakes() {
      const mistakes: MistakeItem[] = []
      let after: string | undefined
      for (;;) {
        let query = client.from('training_mistakes').select('id,data')
          .eq('character_id', characterId).order('id').limit(PAGE_SIZE)
        if (after !== undefined)
          query = query.gt('id', after)
        const { data, error } = await query
        if (error)
          throw error
        for (const row of data)
          mistakes.push(row.data as MistakeItem)
        if (data.length < PAGE_SIZE)
          return mistakes
        after = data[data.length - 1].id as string
      }
    },
    async deleteMistake(id) {
      const { error } = await client.from('training_mistakes').delete()
        .eq('character_id', characterId).eq('id', id)
      if (error)
        throw error
    },
    async clear() {
      const { error } = await client.rpc('clear_training_data', { p_character_id: characterId })
      if (error)
        throw error
    },
  }
}
