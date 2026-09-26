import { describe, expect, it } from 'vitest'
import { DECK_SIZE, evaluate, strengthOf } from '../src'
import golden from './fixtures/strength-golden.json'

// 与 ThinkBiJi/sim/biji_sim.py 逐组合对拍：基准由 scripts/golden/export_strength.py 生成
describe('与 Python 参考实现对拍', () => {
  it('全部 C(54,3) = 24804 种组合的强度完全一致', () => {
    const data = golden as number[]
    expect(data.length).toBe(24804)
    let i = 0
    const mismatches: string[] = []
    for (let a = 0; a < DECK_SIZE; a++) {
      for (let b = a + 1; b < DECK_SIZE; b++) {
        for (let c = b + 1; c < DECK_SIZE; c++) {
          const got = evaluate([a, b, c])
          if (got !== data[i] || strengthOf(c, a, b) !== data[i])
            mismatches.push(`[${a},${b},${c}] ts=${got} py=${data[i]}`)
          i++
        }
      }
    }
    expect(mismatches.slice(0, 10)).toEqual([])
  })
})
