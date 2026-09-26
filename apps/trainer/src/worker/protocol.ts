import type { Card, LaneStrengths, Xi } from '@biji/core'
import type { Tag, Verdict } from '@biji/solver'

/** 主线程 → Worker：评估玩家摆法 */
export interface EvaluateRequest {
  id: number
  hand: Card[]
  /** 玩家摆法，顺序 尾、中、头 */
  player: [Card[], Card[], Card[]]
  lambda: number
  samples: number
  seed: number
}

/** 一种摆法的评估结果（可结构化克隆，去掉了逐局得分数组） */
export interface ScoredDTO {
  lanes: [Card[], Card[], Card[]]
  strengths: LaneStrengths
  foul: boolean
  /** 本摆法成立的喜（不含通关；通关概率见 sweep） */
  xi: Xi[]
  mean: number
  std: number
  stderr: number
  /** 各道拿第一的频率：尾、中、头 */
  laneFirst: [number, number, number]
  sweep: number
  utility: number
  gap: number
  tableRank: number | null
  equivalentBest: boolean
}

export interface GradeDTO {
  verdict: Verdict
  evLoss: number
  gap: number
  player: ScoredDTO
  best: ScoredDTO
  /** 推荐摆法之外、效用最高的若干摆法 */
  alternatives: ScoredDTO[]
  /** 错因诊断；评级为最优时为空 */
  tags: Tag[]
  legalCount: number
  samples: number
  lambda: number
  elapsedMs: number
}

export type EvaluateResponse =
  | { id: number, ok: true, result: GradeDTO }
  | { id: number, ok: false, error: string }
