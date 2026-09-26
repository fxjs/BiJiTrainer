import { describe, expect, it } from 'vitest'
import { isFoul, legalArrangements, makeArrangement, parseCards, PATTERNS, SUBSETS } from '../src'

const t = (text: string) => parseCards(text) as unknown as readonly [number, number, number]

describe('摆法枚举', () => {
  it('84 个三张子集，1680 种有序分配，且每种分配恰好覆盖 9 张', () => {
    expect(SUBSETS.length).toBe(84)
    expect(PATTERNS.length).toBe(1680)
    for (const p of PATTERNS) {
      const idx = p.flatMap(i => SUBSETS[i])
      expect(new Set(idx).size).toBe(9)
    }
  })

  it('合法摆法都满足 尾 ≥ 中 ≥ 头', () => {
    const hand = parseCards('5♦ 8♥ 10♥ Q♣ Q♦ K♣ A♥ A♣ A♦')
    const legal = legalArrangements(hand)
    expect(legal.length).toBeGreaterThan(0)
    expect(legal.length).toBeLessThan(1680)
    for (const { strengths: [st, sm, sh] } of legal) {
      expect(st).toBeGreaterThanOrEqual(sm)
      expect(sm).toBeGreaterThanOrEqual(sh)
    }
  })
})

describe('倒水', () => {
  it('头道顺子、中道对子为倒水', () => {
    expect(isFoul(makeArrangement(t('K♠ K♥ K♦'), t('9♠ 9♥ 5♣'), t('2♠ 3♥ 4♦')))).toBe(true)
  })

  it('尾 ≥ 中 ≥ 头 不倒水', () => {
    expect(isFoul(makeArrangement(t('K♠ K♥ K♦'), t('2♠ 3♥ 4♦'), t('9♠ 9♥ 5♣')))).toBe(false)
  })

  it('中道与头道同为同花时逐张比点', () => {
    expect(isFoul(makeArrangement(t('Q♠ Q♥ Q♦'), t('A♣ 9♣ 8♣'), t('A♥ K♥ 4♥')))).toBe(true)
  })

  it('不是 9 张不同的牌时拒绝', () => {
    expect(() => makeArrangement(t('K♠ K♥ K♦'), t('K♠ 3♥ 4♦'), t('9♠ 9♥ 5♣'))).toThrow()
  })
})
