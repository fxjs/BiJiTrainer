import type { Recommendation, ScoredArrangement } from './recommend'

/**
 * 玩家摆法的评级：
 * - best    与最优在抽样误差内无法区分（equivalentBest）
 * - minor   次优：平均得分差距 < MINOR_GAP
 * - mistake 明显失误：平均得分差距 ≥ MINOR_GAP
 * - foul    倒水（三道全部垫底）
 */
export type Verdict = 'best' | 'minor' | 'mistake' | 'foul'

export const VERDICT_NAME: Record<Verdict, string> = {
  best: '最优',
  minor: '次优',
  mistake: '明显失误',
  foul: '倒水',
}

/**
 * 次优与明显失误的分界（分／手）。讲义中关键手牌的差距为 10~40 分，
 * 平均每手的策略差距在 2 分以内；3 分约为"拿第一概率差 20 个百分点"的量级。
 */
export const MINOR_GAP = 3

export interface Grade {
  verdict: Verdict
  player: ScoredArrangement
  best: ScoredArrangement
  /** 玩家摆法相对推荐摆法损失的平均得分（分） */
  evLoss: number
  /** 玩家摆法与平均得分最高者的差距 */
  gap: number
}

/** 根据 recommend 的结果给玩家摆法评级；玩家摆法须作为 extra[0] 传入 recommend */
export function grade(rec: Recommendation): Grade {
  const player = rec.extra[0]
  if (!player)
    throw new Error('recommend 调用时须以 extra[0] 传入玩家摆法')
  const verdict: Verdict = player.foul
    ? 'foul'
    : player.equivalentBest
      ? 'best'
      : player.gap < MINOR_GAP ? 'minor' : 'mistake'
  return {
    verdict,
    player,
    best: rec.best,
    evLoss: Math.max(0, rec.best.stat.mean - player.stat.mean),
    gap: player.gap,
  }
}
