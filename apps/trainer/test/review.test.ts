import type { PracticeRecord } from '../src/review/stats'
import { evaluate, parseCards } from '@biji/core'
import { describe, expect, it } from 'vitest'
import { permuteSuits } from '../src/review/permute'
import { handKey, INTERVAL_DAYS, isDue, recordMistake, recordReview } from '../src/review/srs'
import { summarize, trend } from '../src/review/stats'

const DAY = 86_400_000
const HAND = parseCards('5♦ 8♥ 10♥ Q♣ Q♦ K♣ A♥ A♣ A♦')

describe('错题本间隔重复', () => {
  it('新错题立即到期，同一手牌重复出错时合并', () => {
    const a = recordMistake(undefined, HAND, 'mistake', 30, ['greedyTail'], 1000)
    expect(a.id).toBe(handKey([...HAND].reverse()))
    expect(isDue(a, 1000)).toBe(true)
    const b = recordMistake({ ...a, box: 3 }, HAND, 'foul', 40, ['foul'], 5000)
    expect(b.box).toBe(0)
    expect(b.attempts).toBe(2)
    expect(b.addedAt).toBe(1000)
  })

  it('复习最优逐盒推迟，越过最后一盒视为掌握', () => {
    let item = recordMistake(undefined, HAND, 'mistake', 30, [], 0)
    let now = 0
    for (let box = 1; box < INTERVAL_DAYS.length; box++) {
      item = recordReview(item, 'best', 0, [], now)!
      expect(item.box).toBe(box)
      expect(item.due).toBe(now + INTERVAL_DAYS[box] * DAY)
      now = item.due
    }
    expect(recordReview(item, 'best', 0, [], now)).toBeNull()
  })

  it('复习次优 1 天后再练；失误或倒水退回第 0 盒', () => {
    const item = { ...recordMistake(undefined, HAND, 'mistake', 30, [], 0), box: 3 }
    const minor = recordReview(item, 'minor', 1, [], 100)!
    expect(minor.box).toBe(3)
    expect(minor.due).toBe(100 + DAY)
    const again = recordReview(item, 'foul', 40, ['foul'], 100)!
    expect(again.box).toBe(0)
    expect(again.tags).toEqual(['foul'])
  })
})

describe('花色置换', () => {
  it('只在同色之间交换，王不变，牌型不变', () => {
    const hand = parseCards('A♠ K♥ Q♣ J♦ 大王 小王 2♠ 3♥ 4♣')
    for (let v = 0; v < 4; v++) {
      const p = permuteSuits(hand, v)
      expect(new Set(p).size).toBe(9)
      expect(p[4]).toBe(hand[4])
      expect(p[5]).toBe(hand[5])
    }
    expect(permuteSuits(hand, 0)).toEqual(hand)
    expect(permuteSuits(hand, 1)).toEqual(parseCards('A♣ K♥ Q♠ J♦ 大王 小王 2♣ 3♥ 4♠'))
    expect(permuteSuits(hand, 3)).toEqual(parseCards('A♣ K♦ Q♠ J♥ 大王 小王 2♣ 3♦ 4♠'))
    // 大王 + 两张红桃的同花，置换后仍是同花
    const flush = parseCards('A♥ 9♥ 大王')
    expect(Math.floor(evaluate(permuteSuits(flush, 2)) / 4)).toBe(Math.floor(evaluate(flush) / 4))
  })
})

describe('统计', () => {
  const rec = (time: number, verdict: PracticeRecord['verdict'], evLoss: number, tags: PracticeRecord['tags'] = []): PracticeRecord => ({
    time,
    source: 'free',
    hand: [],
    player: [[], [], []],
    best: [[], [], []],
    verdict,
    evLoss,
    gap: evLoss,
    playerMean: 0,
    bestMean: 0,
    lambda: 0.1,
    tags,
  })

  it('汇总最优率、平均损失、评级分布与错因排序', () => {
    const s = summarize([
      rec(1, 'best', 0),
      rec(2, 'mistake', 10, ['greedyTail', 'headWasted']),
      rec(3, 'foul', 20, ['foul']),
      rec(4, 'minor', 2, ['headWasted']),
    ])
    expect(s.hands).toBe(4)
    expect(s.bestRate).toBe(0.25)
    expect(s.avgLoss).toBe(8)
    expect(s.verdicts).toEqual({ best: 1, minor: 1, mistake: 1, foul: 1 })
    expect(s.tags[0]).toEqual({ code: 'headWasted', count: 2 })
  })

  it('空记录', () => {
    expect(summarize([]).bestRate).toBe(0)
  })

  it('按时间分组的趋势', () => {
    const records = Array.from({ length: 45 }, (_, i) => rec(100 - i, i < 20 ? 'best' : 'mistake', i < 20 ? 0 : 5))
    const t = trend(records, 20)
    expect(t.map(g => [g.from, g.to])).toEqual([[1, 20], [21, 40], [41, 45]])
    // 时间最早的是 i 最大的那些（mistake）
    expect(t[0].bestRate).toBe(0)
  })
})
