import { describe, expect, it } from 'vitest'
import { compositionXi, makeArrangement, parseCards, Xi, xiOf } from '../src'

const t = (text: string) => parseCards(text) as unknown as readonly [number, number, number]

describe('与摆法无关的喜', () => {
  it('四个头', () => {
    expect(compositionXi(parseCards('A♠ A♥ A♣ A♦ 2♠ 3♥ 7♣ 9♦ J♠'))).toContain(Xi.FourOfAKind)
  })

  it('两组四个头计 2 个喜', () => {
    const xi = compositionXi(parseCards('A♠ A♥ A♣ A♦ K♠ K♥ K♣ K♦ 2♠'))
    expect(xi.filter(x => x === Xi.FourOfAKind).length).toBe(2)
  })

  it('全红可含大王，不能含小王', () => {
    expect(compositionXi(parseCards('2♥ 4♥ 6♥ 8♦ 10♦ Q♦ A♥ K♦ 大王'))).toContain(Xi.AllRed)
    expect(compositionXi(parseCards('2♥ 4♥ 6♥ 8♦ 10♦ Q♦ A♥ K♦ 小王'))).not.toContain(Xi.AllRed)
  })

  it('全黑可含小王，不能含大王', () => {
    expect(compositionXi(parseCards('2♠ 4♠ 6♠ 8♣ 10♣ Q♣ A♠ K♣ 小王'))).toContain(Xi.AllBlack)
    expect(compositionXi(parseCards('2♠ 4♠ 6♠ 8♣ 10♣ Q♣ A♠ K♣ 大王'))).not.toContain(Xi.AllBlack)
  })

  it('同花连顺：9 张同花连续，A 可作 1', () => {
    const xi = compositionXi(parseCards('6♠ 7♠ 8♠ 9♠ 10♠ J♠ Q♠ K♠ A♠'))
    expect(xi).toContain(Xi.NineStraightFlush)
    expect(xi).toContain(Xi.AllBlack)
    expect(compositionXi(parseCards('A♥ 2♥ 3♥ 4♥ 5♥ 6♥ 7♥ 8♥ 9♥'))).toContain(Xi.NineStraightFlush)
    expect(compositionXi(parseCards('5♥ 6♥ 7♥ 8♥ 9♥ 10♥ J♥ Q♥ 大王'))).not.toContain(Xi.NineStraightFlush)
  })
})

describe('取决于摆法的喜', () => {
  it('双豹子需真正摆成两道三条', () => {
    const hand = 'A♠ A♥ A♦ K♠ K♥ K♦ 2♣ 5♦ 9♥'
    expect(xiOf(makeArrangement(t('A♠ A♥ A♦'), t('K♠ K♥ K♦'), t('2♣ 5♦ 9♥')))).toContain(Xi.DoubleTrips)
    expect(xiOf(makeArrangement(t('A♠ A♥ A♦'), t('K♠ K♥ 2♣'), t('K♦ 5♦ 9♥')))).not.toContain(Xi.DoubleTrips)
    expect(parseCards(hand).length).toBe(9)
  })

  it('全三条不另计双豹子', () => {
    const xi = xiOf(makeArrangement(t('A♠ A♥ A♦'), t('K♠ K♥ K♦'), t('Q♠ Q♥ Q♦')))
    expect(xi).toContain(Xi.AllTrips)
    expect(xi).not.toContain(Xi.DoubleTrips)
  })

  it('同花连顺摆成三顺清时叠加 3 个喜', () => {
    const xi = xiOf(makeArrangement(t('Q♠ K♠ A♠'), t('9♠ 10♠ J♠'), t('6♠ 7♠ 8♠')))
    expect(xi.sort()).toEqual([Xi.AllBlack, Xi.NineStraightFlush, Xi.TripleStraightFlush].sort())
  })
})
