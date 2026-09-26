import type { Arrangement, Card, SeatInput, Xi } from '@biji/core'
import type { LaneModel } from './model'
import type { Rng } from './rng'
import { arrangementXi, compositionXi, foldCost, fullDeck, HAND_SIZE, settle, TABLE_SIZE } from '@biji/core'
import { choosePattern, patternArrangement, patternStrengths, tableValue, viewHand } from './policy'
import { mulberry32, shuffleInPlace } from './rng'

/**
 * 对手弃牌的启发式模型（待按实际牌桌经验校准）：
 * 对手按表估值摆出最优摆法，若其估值 < −本次弃牌成本 + OPPONENT_FOLD_SLACK 则弃牌。
 * 放宽 3 分是因为弃牌还能免付他人的喜分，第一个弃牌者还能拿下一局首家；
 * 不放宽时第 1 个弃牌（成本 15）几乎不会发生，因为三道全垫底也只付 15 分。
 */
export const OPPONENT_FOLD_SLACK = 3

export function opponentFolds(value: number, foldOrder: number, tableSize = TABLE_SIZE): boolean {
  if (foldOrder > tableSize - 1)
    return false
  return value < -foldCost(foldOrder, tableSize) + OPPONENT_FOLD_SLACK
}

/** 弃牌情境：自己之前已有 position 人声明，其中 foldedBefore 人弃牌 */
export interface FoldScenario {
  /** 0..5，0 表示自己是首家 */
  position: number
  foldedBefore: number
}

export interface FoldEvaluation {
  scenario: FoldScenario
  /** 至少要有 1 人不弃牌；前面 5 人都弃了时不能弃 */
  canFold: boolean
  /** 自己弃牌要放的分数（第 foldedBefore + 1 个弃牌者） */
  cost: number
  /** 不弃、按表估值最优摆法打的平均得分及其波动 */
  playMean: number
  playStd: number
  playStderr: number
  /** playMean − (−cost)：为正则不弃更好 */
  diff: number
  decision: 'fold' | 'play'
  /** 两者差距在抽样误差内（|diff| ≤ max(0.5, 2 × 标准误)），选哪个都算对 */
  close: boolean
  /** 不弃时的摆法 */
  arrangement: Arrangement
  /** 不弃时能成的喜（不含通关）；弃牌即放弃这些喜分 */
  xi: Xi[]
  /** 后面座次平均弃牌人数 */
  laterFolds: number
  samples: number
}

export interface FoldOptions {
  samples?: number
  seed?: number
}

/**
 * 蒙特卡洛估计"不弃"的得分，与弃牌成本比较。
 * 近似：前面已弃牌者的手牌按随机处理（未按"手牌偏弱"做条件抽样）；
 * 前面未弃牌者照常摆牌；后面座次按 opponentFolds 决定是否弃牌。
 */
export function evaluateFold(
  hand: readonly Card[],
  model: LaneModel,
  scenario: FoldScenario,
  opts: FoldOptions = {},
): FoldEvaluation {
  const { position, foldedBefore } = scenario
  if (!(position >= 0 && position < TABLE_SIZE && foldedBefore >= 0 && foldedBefore <= position))
    throw new RangeError(`弃牌情境无效: ${JSON.stringify(scenario)}`)
  const samples = opts.samples ?? 2000
  const rng = mulberry32(opts.seed ?? 1)

  const view = viewHand(hand)
  const arrangement = patternArrangement(view, choosePattern(view, model, 'top'))
  const own = new Set(hand)
  const rest = fullDeck().filter(c => !own.has(c))
  if (rest.length !== (TABLE_SIZE - 1) * HAND_SIZE)
    throw new RangeError('手牌必须是 9 张不同的牌')

  let sum = 0
  let sumSq = 0
  let laterFolds = 0
  for (let n = 0; n < samples; n++) {
    shuffleInPlace(rest, rng)
    const seats: SeatInput[] = []
    let opp = 0
    let folds = 0
    for (let s = 0; s < TABLE_SIZE; s++) {
      if (s === position) {
        seats.push(arrangement)
        continue
      }
      const oppHand = rest.slice(opp * HAND_SIZE, (opp + 1) * HAND_SIZE)
      opp++
      if (s < position) {
        // 前面座次：前 foldedBefore 人弃牌，其余摆牌
        if (s < foldedBefore) {
          seats.push({ foldOrder: ++folds })
          continue
        }
        const v = viewHand(oppHand)
        seats.push(patternArrangement(v, choosePattern(v, model, 'top')))
        continue
      }
      const v = viewHand(oppHand)
      const p = choosePattern(v, model, 'top')
      if (opponentFolds(tableValue(model, ...patternStrengths(v, p)), folds + 1)) {
        seats.push({ foldOrder: ++folds })
        laterFolds++
      }
      else {
        seats.push(patternArrangement(v, p))
      }
    }
    const total = settle(seats)[position].total
    sum += total
    sumSq += total * total
  }

  const playMean = sum / samples
  const playStd = Math.sqrt(Math.max(0, (sumSq - samples * playMean * playMean) / Math.max(1, samples - 1)))
  const playStderr = playStd / Math.sqrt(samples)
  const canFold = foldedBefore < TABLE_SIZE - 1
  const cost = canFold ? foldCost(foldedBefore + 1) : 0
  const diff = playMean + cost
  return {
    scenario,
    canFold,
    cost,
    playMean,
    playStd,
    playStderr,
    diff,
    decision: canFold && diff < 0 ? 'fold' : 'play',
    close: canFold && Math.abs(diff) <= Math.max(0.5, 2 * playStderr),
    arrangement,
    xi: [...compositionXi(hand), ...arrangementXi(arrangement)],
    laterFolds: laterFolds / samples,
    samples,
  }
}

/** 弃牌训练题中弱牌的比例；全是随机牌时绝大多数题答案都是"不弃" */
export const DRILL_WEAK_SHARE = 0.8
/** 弱牌：表估值最优摆法 < −5 分 */
export const DRILL_WEAK_VALUE = -5

/** 生成一道弃牌训练题：随机手牌（多数为弱牌）+ 随机座次与前面弃牌人数 */
export function generateFoldDrill(model: LaneModel, rng: Rng): { hand: Card[], scenario: FoldScenario } {
  const wantWeak = rng() < DRILL_WEAK_SHARE
  const deck = fullDeck()
  let hand: Card[] = []
  for (let tries = 0; tries < 500; tries++) {
    hand = shuffleInPlace(deck, rng).slice(0, HAND_SIZE)
    if (!wantWeak)
      break
    const v = viewHand(hand)
    if (tableValue(model, ...patternStrengths(v, choosePattern(v, model, 'top'))) < DRILL_WEAK_VALUE)
      break
  }
  const position = Math.floor(rng() * TABLE_SIZE)
  // 前面最多 4 人弃牌，保证自己还能选择弃牌
  const foldedBefore = Math.floor(rng() * (Math.min(position, TABLE_SIZE - 2) + 1))
  return { hand, scenario: { position, foldedBefore } }
}
