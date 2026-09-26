import type { LaneTable } from './model'
import table from '../data/lane-model.json'
import { LaneModel } from './model'

let model: LaneModel | null = null

/** 随包发布的胜率表（由 scripts/tables/gen-tables.ts 生成） */
export function defaultModel(): LaneModel {
  model ??= LaneModel.fromTable(table as LaneTable)
  return model
}
