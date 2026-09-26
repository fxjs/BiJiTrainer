import type { Card } from '@biji/core'
import type { TagCode, Verdict } from '@biji/solver'

/**
 * 错题本的间隔重复（Leitner 盒子）：
 * - 新错题进第 0 盒，立即到期
 * - 复习评为最优：进下一盒，按 INTERVAL_DAYS 推迟；越过最后一盒即视为掌握，移出错题本
 * - 复习评为次优：盒子不变，1 天后再练
 * - 复习评为明显失误或倒水：退回第 0 盒，立即到期
 */
export const INTERVAL_DAYS = [0, 1, 3, 7, 16, 35] as const
export const MASTERED_BOX = INTERVAL_DAYS.length
const DAY = 24 * 60 * 60 * 1000

export interface MistakeItem {
  /** 原始手牌的规范键（升序牌编号），同一手牌重复出错时合并 */
  id: string
  /** 原始手牌；复习时会做花色置换 */
  hand: Card[]
  addedAt: number
  box: number
  /** 到期时间（毫秒时间戳） */
  due: number
  attempts: number
  lastVerdict: Verdict
  lastEvLoss: number
  tags: TagCode[]
}

export function handKey(hand: readonly Card[]): string {
  return [...hand].sort((a, b) => a - b).join(',')
}

/** 自由练习中出现明显失误或倒水时，加入或重置错题 */
export function recordMistake(
  existing: MistakeItem | undefined,
  hand: readonly Card[],
  verdict: Verdict,
  evLoss: number,
  tags: TagCode[],
  now: number,
): MistakeItem {
  return {
    id: handKey(hand),
    hand: [...hand].sort((a, b) => a - b),
    addedAt: existing?.addedAt ?? now,
    box: 0,
    due: now,
    attempts: (existing?.attempts ?? 0) + 1,
    lastVerdict: verdict,
    lastEvLoss: evLoss,
    tags,
  }
}

/** 复习后更新；返回 null 表示已掌握、应移出错题本 */
export function recordReview(item: MistakeItem, verdict: Verdict, evLoss: number, tags: TagCode[], now: number): MistakeItem | null {
  const base = { ...item, attempts: item.attempts + 1, lastVerdict: verdict, lastEvLoss: evLoss }
  if (verdict === 'best') {
    const box = item.box + 1
    if (box >= MASTERED_BOX)
      return null
    return { ...base, box, due: now + INTERVAL_DAYS[box] * DAY }
  }
  if (verdict === 'minor')
    return { ...base, due: now + DAY }
  return { ...base, box: 0, due: now, tags }
}

export function isDue(item: MistakeItem, now: number): boolean {
  return item.due <= now
}
