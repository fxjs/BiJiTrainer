import type { Arrangement, Card, LaneStrengths, Triple } from '@biji/core'
import type { LaneModel } from './model'
import { HAND_SIZE, PATTERNS, strengthOf, SUBSETS } from '@biji/core'
import { SWEEP_BONUS } from './model'

/**
 * 摆牌策略（与 biji_sim.arrange 同口径）：
 * - top    按本规则的期望得分：Σ 每道 15·T − 5·(1−p)，加通关近似 25·T尾·T中·T头
 * - duel   只看三道单挑胜率之和（旧的"均衡"思路，用于对比）
 * - greedy 尾道尽量大，其次中道，其次头道（直觉摆法，用于对比）
 * 以上都不含喜分；推荐层会另加依赖摆法的喜。
 */
export type Policy = 'top' | 'duel' | 'greedy'

/** 一手牌的 84 个三张子集及其强度，按升序排好的手牌计算 */
export interface HandView {
  /** 升序排列的 9 张牌；PATTERNS 的下标都指向它 */
  sorted: Card[]
  /** SUBSETS[i] 对应的强度 */
  subsetStrength: Int32Array
}

export function viewHand(hand: readonly Card[]): HandView {
  if (hand.length !== HAND_SIZE)
    throw new RangeError(`手牌必须是 9 张，实际 ${hand.length} 张`)
  // 必须升序：Python 对拍时同分摆法按 PATTERNS 顺序取第一个，顺序依赖手牌排列
  const sorted = [...hand].sort((a, b) => a - b)
  const ss = new Int32Array(SUBSETS.length)
  SUBSETS.forEach(([i, j, k], idx) => {
    ss[idx] = strengthOf(sorted[i], sorted[j], sorted[k])
  })
  return { sorted, subsetStrength: ss }
}

export function patternArrangement(view: HandView, pattern: number): Arrangement {
  const pick = (sub: number): Triple => {
    const [i, j, k] = SUBSETS[sub]
    return [view.sorted[i], view.sorted[j], view.sorted[k]]
  }
  const [t, m, h] = PATTERNS[pattern]
  return { lanes: [pick(t), pick(m), pick(h)] }
}

export function patternStrengths(view: HandView, pattern: number): LaneStrengths {
  const [t, m, h] = PATTERNS[pattern]
  const ss = view.subsetStrength
  return [ss[t], ss[m], ss[h]]
}

/** 按 top 策略的估值（表估值），运算顺序与 biji_sim 一致 */
export function tableValue(model: LaneModel, st: number, sm: number, sh: number): number {
  const [et, em, eh] = model.ev
  const [tt, tm, th] = model.top
  return et[st] + em[sm] + eh[sh] + SWEEP_BONUS * tt[st] * tm[sm] * th[sh]
}

/** 按策略选出一个合法摆法，返回 PATTERNS 下标。同分时取 PATTERNS 顺序中的第一个 */
export function choosePattern(view: HandView, model: LaneModel | null, policy: Policy): number {
  const ss = view.subsetStrength
  let best = -1
  let bestVal = -Infinity
  let bt = -1
  let bm = -1
  let bh = -1
  for (let i = 0; i < PATTERNS.length; i++) {
    const [t, m, h] = PATTERNS[i]
    const st = ss[t]
    const sm = ss[m]
    const sh = ss[h]
    if (!(st >= sm && sm >= sh))
      continue
    if (policy === 'greedy') {
      // 字典序 (尾, 中, 头) 最大
      if (best === -1 || st > bt || (st === bt && (sm > bm || (sm === bm && sh > bh)))) {
        best = i
        bt = st
        bm = sm
        bh = sh
      }
      continue
    }
    if (!model)
      throw new Error(`${policy} 策略需要胜率模型`)
    const val = policy === 'duel'
      ? model.p[0][st] + model.p[1][sm] + model.p[2][sh]
      : tableValue(model, st, sm, sh)
    if (val > bestVal) {
      bestVal = val
      best = i
    }
  }
  return best
}

export function chooseArrangement(hand: readonly Card[], model: LaneModel | null, policy: Policy): Arrangement {
  const view = viewHand(hand)
  return patternArrangement(view, choosePattern(view, model, policy))
}

export interface RankedPattern {
  pattern: number
  strengths: LaneStrengths
  /** top 策略的表估值（不含喜分） */
  value: number
}

/** 全部合法摆法按表估值降序排列（同分保持 PATTERNS 顺序） */
export function rankPatterns(view: HandView, model: LaneModel): RankedPattern[] {
  const out: RankedPattern[] = []
  for (let i = 0; i < PATTERNS.length; i++) {
    const s = patternStrengths(view, i)
    if (s[0] >= s[1] && s[1] >= s[2])
      out.push({ pattern: i, strengths: s, value: tableValue(model, s[0], s[1], s[2]) })
  }
  return out.sort((a, b) => b.value - a.value)
}
