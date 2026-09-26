/**
 * 牌编码，与 ThinkBiJi/sim/biji_sim.py 完全一致，便于与 Python 模拟逐项对拍：
 * - 0..51 为普通牌：点数 = (id >> 2) + 2（2..14，14 为 A），花色 = id & 3
 * - 52 为小王，53 为大王
 */
export type Card = number

export const SMALL_JOKER = 52
export const BIG_JOKER = 53
/** 一副牌 54 张，6 人每人 9 张恰好发完 */
export const DECK_SIZE = 54

/** 花色编号：0 ♠、1 ♥、2 ♣、3 ♦。红色 = ♥♦，黑色 = ♠♣ */
export const Suit = {
  Spade: 0,
  Heart: 1,
  Club: 2,
  Diamond: 3,
} as const
export type Suit = (typeof Suit)[keyof typeof Suit]

export const ACE = 14

const SUIT_SYMBOLS = ['♠', '♥', '♣', '♦'] as const
const RANK_NAMES: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }

export function isJoker(c: Card): boolean {
  return c >= SMALL_JOKER
}

/** 点数：普通牌 2..14；王没有点数，仅在比点时视为小王 0、大王 1，均低于 2 */
export function rankOf(c: Card): number {
  if (c === SMALL_JOKER)
    return 0
  if (c === BIG_JOKER)
    return 1
  return (c >> 2) + 2
}

/** 花色；王返回 null（王只能在同花中补色，本身不属于任何花色） */
export function suitOf(c: Card): Suit | null {
  return isJoker(c) ? null : (c & 3) as Suit
}

export function isRedSuit(s: Suit): boolean {
  return s === Suit.Heart || s === Suit.Diamond
}

/** 王能否补该花色：大王只补红色（♥♦），小王只补黑色（♠♣），因此双王不能同在一个同花里 */
export function jokerFits(joker: Card, s: Suit): boolean {
  return joker === BIG_JOKER ? isRedSuit(s) : !isRedSuit(s)
}

/** 比较用花色分：♠ 3 > ♥ 2 > ♣ 1 > ♦ 0；王记 0（王不会成为主牌） */
export function suitScore(c: Card): number {
  return isJoker(c) ? 0 : 3 - (c & 3)
}

export function makeCard(rank: number, suit: Suit): Card {
  if (rank < 2 || rank > ACE)
    throw new RangeError(`点数越界: ${rank}`)
  return (rank - 2) * 4 + suit
}

export function fullDeck(): Card[] {
  return Array.from({ length: DECK_SIZE }, (_, i) => i)
}

export function cardToString(c: Card): string {
  if (c === SMALL_JOKER)
    return '小王'
  if (c === BIG_JOKER)
    return '大王'
  const r = rankOf(c)
  return (RANK_NAMES[r] ?? String(r)) + SUIT_SYMBOLS[c & 3]
}

const SUIT_BY_CHAR: Record<string, Suit> = {
  '♠': Suit.Spade, 's': Suit.Spade, 'S': Suit.Spade,
  '♥': Suit.Heart, 'h': Suit.Heart, 'H': Suit.Heart,
  '♣': Suit.Club, 'c': Suit.Club, 'C': Suit.Club,
  '♦': Suit.Diamond, 'd': Suit.Diamond, 'D': Suit.Diamond,
}
const RANK_BY_NAME: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14, T: 10 }

/** 解析单张牌，如 "A♠"、"10♥"、"Td"、"小王"、"大王" */
export function parseCard(text: string): Card {
  const t = text.trim()
  if (t === '小王')
    return SMALL_JOKER
  if (t === '大王')
    return BIG_JOKER
  const suit = SUIT_BY_CHAR[t.slice(-1)]
  const rankText = t.slice(0, -1).toUpperCase()
  const rank = RANK_BY_NAME[rankText] ?? Number(rankText)
  if (suit === undefined || !Number.isInteger(rank) || rank < 2 || rank > ACE)
    throw new SyntaxError(`无法解析的牌: ${text}`)
  return makeCard(rank, suit)
}

/** 解析以空白分隔的一组牌，格式与 ThinkBiJi/sim/analyze.py 的输入一致 */
export function parseCards(text: string): Card[] {
  const cards = text.trim().split(/\s+/).filter(Boolean).map(parseCard)
  if (new Set(cards).size !== cards.length)
    throw new SyntaxError(`存在重复的牌: ${text}`)
  return cards
}

export function formatCards(cards: readonly Card[]): string {
  return cards.map(cardToString).join(' ')
}
