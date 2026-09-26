/**
 * 自博弈训练胜率表，方法与 ThinkBiJi/sim/biji_sim.py 的 train() 相同：
 * 首轮以"随机三张牌的强度分布"估值，之后每轮用上一轮全桌的实际分布重新估值，
 * 共三轮（2 万 → 5 万 → 40 万局），近似"全员按同一思路摆牌"的均衡。
 *
 * 输出：
 * - packages/solver/data/lane-model.json         胜率表，随包发布
 * - packages/solver/data/lane-model.report.json  最后一轮的统计，用于与讲义数值核对
 *
 * 运行：pnpm tables
 */
import type { Policy } from '../../packages/solver/src/policy'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Category, CATEGORY_NAME, categoryOf, describe, evaluate, fullDeck, LANE_NAME } from '../../packages/core/src'
import { LaneModel } from '../../packages/solver/src/model'
import { choosePattern, patternStrengths, viewHand } from '../../packages/solver/src/policy'
import { mulberry32, shuffleInPlace } from '../../packages/solver/src/rng'

const ROUNDS: [deals: number, seed: number][] = [[20000, 1], [50000, 100001], [400000, 900001]]
const PLAYERS = 6
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages', 'solver', 'data')

interface RoundResult {
  deals: number
  /** 每局每人三道强度：[局][人][道] 展平 */
  lanes: Int32Array
  /** 0 号玩家改用 greedy / duel 时的三道强度：[局][策略][道] 展平 */
  alt: Int32Array
  /** 每局每人持王数 */
  jokers: Uint8Array
}

function strengthsFor(hand: number[], model: LaneModel, policy: Policy): readonly [number, number, number] {
  const view = viewHand(hand)
  return patternStrengths(view, choosePattern(view, model, policy))
}

function runRound(model: LaneModel, deals: number, seed: number, withAlt: boolean): RoundResult {
  const rng = mulberry32(seed)
  const deck = fullDeck()
  const lanes = new Int32Array(deals * PLAYERS * 3)
  const alt = new Int32Array(withAlt ? deals * 6 : 0)
  const jokers = new Uint8Array(deals * PLAYERS)
  for (let d = 0; d < deals; d++) {
    shuffleInPlace(deck, rng)
    for (let p = 0; p < PLAYERS; p++) {
      const hand = deck.slice(p * 9, p * 9 + 9)
      const view = viewHand(hand)
      lanes.set(patternStrengths(view, choosePattern(view, model, 'top')), (d * PLAYERS + p) * 3)
      jokers[d * PLAYERS + p] = hand.filter(c => c >= 52).length
      if (withAlt && p === 0) {
        alt.set(strengthsFor(hand, model, 'greedy'), d * 6)
        alt.set(strengthsFor(hand, model, 'duel'), d * 6 + 3)
      }
    }
    if ((d + 1) % 50000 === 0)
      process.stderr.write(`  ${d + 1}/${deals}\n`)
  }
  return { deals, lanes, alt, jokers }
}

/** 由一轮结果得到每道全体强度样本与"其余 5 人最大值"样本（均升序） */
function fit(r: RoundResult): LaneModel {
  const n = r.deals * PLAYERS
  const dists = [0, 1, 2].map(() => new Int32Array(n))
  const maxima = [0, 1, 2].map(() => new Int32Array(n))
  for (let d = 0; d < r.deals; d++) {
    for (let k = 0; k < 3; k++) {
      let first = -1
      let second = -1
      for (let p = 0; p < PLAYERS; p++) {
        const s = r.lanes[(d * PLAYERS + p) * 3 + k]
        if (s > first) {
          second = first
          first = s
        }
        else if (s > second) {
          second = s
        }
      }
      for (let p = 0; p < PLAYERS; p++) {
        const s = r.lanes[(d * PLAYERS + p) * 3 + k]
        dists[k][d * PLAYERS + p] = s
        maxima[k][d * PLAYERS + p] = s === first ? second : first
      }
    }
  }
  dists.forEach(a => a.sort())
  maxima.forEach(a => a.sort())
  return LaneModel.fromSamples(dists, maxima)
}

/** 只含名次分与通关的结算，与 biji_sim.settle 相同（不含其他喜），用于复现讲义数值 */
function settleLanes(arrs: number[][]): { pts: number[], sweeper: number } {
  const pts = Array.from({ length: arrs.length }, () => 0)
  const firsts: number[] = []
  for (let k = 0; k < 3; k++) {
    const order = arrs.map((_, i) => i).sort((a, b) => arrs[b][k] - arrs[a][k])
    order.forEach((i, r) => {
      pts[i] += r === 0 ? 15 : -r
    })
    firsts.push(order[0])
  }
  const sweeper = firsts[0] === firsts[1] && firsts[1] === firsts[2] ? firsts[0] : -1
  if (sweeper >= 0)
    pts.forEach((_, i) => pts[i] += i === sweeper ? 25 : -5)
  return { pts, sweeper }
}

function report(model: LaneModel, r: RoundResult, seconds: number) {
  const n = r.deals
  const laneOf = (d: number, p: number) => [0, 1, 2].map(k => r.lanes[(d * PLAYERS + p) * 3 + k])

  const freq = [0, 1, 2].map(() => Array.from({ length: 6 }, () => 0))
  const champ = [0, 1, 2].map(() => new Int32Array(n))
  const tot: Record<Policy, number> = { top: 0, greedy: 0, duel: 0 }
  const sweepP0: Record<Policy, number> = { top: 0, greedy: 0, duel: 0 }
  let sweepAny = 0
  const joker = [[0, 0], [0, 0], [0, 0]]

  for (let d = 0; d < n; d++) {
    const arrs = Array.from({ length: PLAYERS }, (_, p) => laneOf(d, p))
    for (let k = 0; k < 3; k++) {
      let mx = -1
      for (const a of arrs) {
        freq[k][categoryOf(a[k])]++
        mx = Math.max(mx, a[k])
      }
      champ[k][d] = mx
    }
    const { pts, sweeper } = settleLanes(arrs)
    tot.top += pts[0]
    sweepP0.top += Number(sweeper === 0)
    sweepAny += Number(sweeper >= 0)
    for (let p = 0; p < PLAYERS; p++) {
      const j = r.jokers[d * PLAYERS + p]
      joker[j][0] += pts[p]
      joker[j][1]++
    }
    for (const [i, policy] of (['greedy', 'duel'] as const).entries()) {
      const a0 = Array.from(r.alt.subarray(d * 6 + i * 3, d * 6 + i * 3 + 3))
      const res = settleLanes([a0, ...arrs.slice(1)])
      tot[policy] += res.pts[0]
      sweepP0[policy] += Number(res.sweeper === 0)
    }
  }
  champ.forEach(a => a.sort())

  const c = (rank: number, suit: number) => (rank - 2) * 4 + suit
  // 代表牌，与 biji_sim.main 的 reps 相同
  const reps: [string, number[]][] = [
    ['乌龙 A 高', [c(14, 1), c(9, 2), c(5, 3)]],
    ['对 5', [c(5, 1), c(5, 2), c(9, 3)]],
    ['对 10', [c(10, 1), c(10, 2), c(5, 3)]],
    ['对 A', [c(14, 1), c(14, 2), c(5, 3)]],
    ['顺子 567', [c(5, 1), c(6, 2), c(7, 3)]],
    ['顺子 QKA', [c(12, 1), c(13, 2), c(14, 3)]],
    ['同花 10 高', [c(10, 2), c(7, 2), c(3, 2)]],
    ['同花 K 高', [c(13, 2), c(9, 2), c(4, 2)]],
    ['同花 A 高', [c(14, 2), c(9, 2), c(4, 2)]],
    ['同花 A-K 高', [c(14, 2), c(13, 2), c(4, 2)]],
    ['同花顺 789', [c(7, 2), c(8, 2), c(9, 2)]],
    ['三条 5', [c(5, 1), c(5, 2), c(5, 3)]],
    ['三条 K', [c(13, 1), c(13, 2), c(13, 3)]],
  ]

  const lanes = [0, 1, 2] as const
  return {
    n_deals: n,
    seconds,
    ev: Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, v / n])),
    sweep_p0: Object.fromEntries(Object.entries(sweepP0).map(([k, v]) => [k, v / n])),
    sweep_any: sweepAny / n,
    freq: Object.fromEntries(lanes.map(k => [LANE_NAME[k], Object.fromEntries(
      Object.values(Category).map(cat => [CATEGORY_NAME[cat], freq[k][cat] / (n * PLAYERS)]),
    )])),
    champion: Object.fromEntries(lanes.map(k => [LANE_NAME[k], Object.fromEntries(
      [0.1, 0.25, 0.5, 0.75].map(q => [q, describe(champ[k][Math.floor(n * q)])]),
    )])),
    reps: reps.map(([name, cards]) => {
      const s = evaluate(cards)
      return {
        name,
        ...Object.fromEntries(lanes.map(k => [LANE_NAME[k], { p: model.p[k][s], top: model.top[k][s], ev: model.ev[k][s] }])),
      }
    }),
    joker_ev: Object.fromEntries(joker.map(([sum, cnt], j) => [j, [sum / cnt, cnt / (PLAYERS * n)]])),
  }
}

function main() {
  const t0 = performance.now()
  let model = LaneModel.initial()
  let last: RoundResult | null = null
  for (const [i, [deals, seed]] of ROUNDS.entries()) {
    process.stderr.write(`round ${i + 1}: ${deals} deals\n`)
    last = runRound(model, deals, seed, i === ROUNDS.length - 1)
    model = fit(last)
  }
  const seconds = Math.round((performance.now() - t0) / 1000)
  writeFileSync(join(OUT_DIR, 'lane-model.json'), JSON.stringify(model.toTable('scripts/tables/gen-tables.ts', last!.deals)))
  writeFileSync(join(OUT_DIR, 'lane-model.report.json'), `${JSON.stringify(report(model, last!, seconds), null, 1)}\n`)
  process.stderr.write(`done in ${seconds}s\n`)
}

main()
