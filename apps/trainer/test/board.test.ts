import { Lane, parseCards, strengthOf } from '@biji/core'
import { describe, expect, it } from 'vitest'
import {
  clearLanes,
  createBoard,
  dealHand,
  foulCheck,
  isComplete,
  laneInfo,
  placeSelected,
  poolCards,
  removeFromLane,
  sortCards,
  toArrangement,
  toggleSelect,
} from '../src/practice/board'

const HAND = parseCards('5♦ 8♥ 10♥ Q♣ Q♦ K♣ A♥ A♣ A♦')
const c = (t: string) => parseCards(t)[0]

/** 依次选中并放入某一道 */
function put(b: ReturnType<typeof createBoard>, lane: Lane, text: string) {
  for (const card of parseCards(text))
    b = toggleSelect(b, card)
  return placeSelected(b, lane)
}

describe('手牌区', () => {
  it('按点数排序：从大到小，王在最后', () => {
    const cards = parseCards('5♦ 大王 A♥ 10♥ 小王 K♣')
    expect(sortCards(cards, 'rank')).toEqual(parseCards('A♥ K♣ 10♥ 5♦ 大王 小王'))
  })

  it('按花色排序：♠♥♣♦ 分组，组内从大到小，王在最后', () => {
    const cards = parseCards('5♦ 大王 A♥ 10♥ 2♠ K♣ A♦')
    expect(sortCards(cards, 'suit')).toEqual(parseCards('2♠ A♥ 10♥ K♣ A♦ 5♦ 大王'))
  })

  it('已放入某一道的牌不在手牌区，也不能再选中', () => {
    let b = put(createBoard(HAND), Lane.Tail, 'A♥ A♣ A♦')
    expect(poolCards(b, 'rank')).toHaveLength(6)
    expect(toggleSelect(b, c('A♥'))).toBe(b)
    b = toggleSelect(b, c('5♦'))
    expect(b.selected).toEqual([c('5♦')])
    b = toggleSelect(b, c('5♦'))
    expect(b.selected).toEqual([])
  })
})

describe('放入与撤回', () => {
  it('一道最多 3 张，放不下的牌保持选中', () => {
    let b = createBoard(HAND)
    for (const card of parseCards('A♥ A♣ A♦ K♣'))
      b = toggleSelect(b, card)
    b = placeSelected(b, Lane.Tail)
    expect(b.lanes[Lane.Tail]).toEqual(parseCards('A♥ A♣ A♦'))
    expect(b.selected).toEqual([c('K♣')])
    // 已满的道不再接收
    expect(placeSelected(b, Lane.Tail)).toBe(b)
  })

  it('撤回后回到手牌区', () => {
    let b = put(createBoard(HAND), Lane.Head, 'A♥ 10♥ 8♥')
    b = removeFromLane(b, Lane.Head, c('10♥'))
    expect(b.lanes[Lane.Head]).toEqual(parseCards('A♥ 8♥'))
    expect(poolCards(b, 'rank')).toContain(c('10♥'))
  })

  it('清空三道', () => {
    const b = clearLanes(put(createBoard(HAND), Lane.Head, 'A♥ 10♥ 8♥'))
    expect(b.lanes.flat()).toEqual([])
    expect(poolCards(b, 'rank')).toHaveLength(9)
  })

  it('三道摆满后可转成摆法，并给出牌型描述', () => {
    let b = createBoard(HAND)
    b = put(b, Lane.Tail, 'A♣ K♣ Q♣')
    b = put(b, Lane.Middle, 'A♦ Q♦ 5♦')
    expect(isComplete(b)).toBe(false)
    expect(() => toArrangement(b)).toThrow()
    b = put(b, Lane.Head, 'A♥ 10♥ 8♥')
    expect(isComplete(b)).toBe(true)
    expect(toArrangement(b).lanes[Lane.Tail]).toEqual(parseCards('A♣ K♣ Q♣'))
    expect(laneInfo(b, Lane.Tail).label).toBe('同花顺 QKA')
    expect(laneInfo(b, Lane.Middle).strength).toBe(strengthOf(c('A♦'), c('Q♦'), c('5♦')))
    expect(foulCheck(b).any).toBe(false)
  })
})

describe('倒水检查', () => {
  it('只比较已摆满的道', () => {
    const b = put(createBoard(HAND), Lane.Head, 'A♥ A♣ A♦')
    expect(foulCheck(b).any).toBe(false)
  })

  it('中道小于头道', () => {
    let b = createBoard(HAND)
    b = put(b, Lane.Middle, 'Q♣ 8♥ 5♦')
    b = put(b, Lane.Head, 'A♥ A♣ A♦')
    const f = foulCheck(b)
    expect(f.midHead).toBe(true)
    expect(f.tailMid).toBe(false)
  })

  it('尾道与头道都满且尾道更小时，中道未满也提前报倒水', () => {
    let b = createBoard(HAND)
    b = put(b, Lane.Tail, 'Q♣ 8♥ 5♦')
    b = put(b, Lane.Head, 'A♥ A♣ A♦')
    expect(foulCheck(b).tailHead).toBe(true)
    expect(foulCheck(b).any).toBe(true)
  })
})

describe('发牌', () => {
  it('9 张互不相同且都在 0..53', () => {
    for (let i = 0; i < 200; i++) {
      const hand = dealHand()
      expect(new Set(hand).size).toBe(9)
      expect(hand.every(x => x >= 0 && x < 54)).toBe(true)
    }
  })

  it('注入的随机数决定发牌结果', () => {
    // random 恒为 0 时，依次把第 0 张换到末尾
    expect(dealHand(() => 0)).toHaveLength(9)
    expect(dealHand(() => 0)).toEqual(dealHand(() => 0))
  })
})
