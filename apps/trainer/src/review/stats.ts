import type { TagCode, Verdict } from '@biji/solver'

/** 一次自由练习或错题复习的记录，按人物身份存入 Supabase。 */
export interface PracticeRecord {
  id?: number
  time: number
  source: 'free' | 'review'
  hand: number[]
  player: [number[], number[], number[]]
  best: [number[], number[], number[]]
  verdict: Verdict
  evLoss: number
  gap: number
  playerMean: number
  bestMean: number
  tags: TagCode[]
}

export interface StatsSummary {
  hands: number
  bestRate: number
  /** 平均期望损失（分／手） */
  avgLoss: number
  verdicts: Record<Verdict, number>
  /** 错因出现次数，降序 */
  tags: { code: TagCode, count: number }[]
}

export function summarize(records: readonly PracticeRecord[]): StatsSummary {
  const verdicts: Record<Verdict, number> = { best: 0, minor: 0, mistake: 0, foul: 0 }
  const tagCount = new Map<TagCode, number>()
  let loss = 0
  for (const r of records) {
    verdicts[r.verdict]++
    loss += r.evLoss
    for (const t of r.tags)
      tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
  }
  const n = records.length
  return {
    hands: n,
    bestRate: n ? verdicts.best / n : 0,
    avgLoss: n ? loss / n : 0,
    verdicts,
    tags: [...tagCount].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
  }
}

/** 按时间顺序每 size 手一组的平均损失与最优率，用于观察进步趋势；最后一组可能不满 */
export function trend(records: readonly PracticeRecord[], size = 20): { from: number, to: number, avgLoss: number, bestRate: number }[] {
  const sorted = [...records].sort((a, b) => a.time - b.time)
  const out = []
  for (let i = 0; i < sorted.length; i += size) {
    const s = summarize(sorted.slice(i, i + size))
    out.push({ from: i + 1, to: i + s.hands, avgLoss: s.avgLoss, bestRate: s.bestRate })
  }
  return out
}
