/** 带符号的分数，负号用 U+2212，与讲义一致，例如 +5.8、−3.2 */
export function signed(n: number, digits = 1): string {
  const v = n.toFixed(digits)
  if (Number(v) === 0)
    return (0).toFixed(digits)
  return n > 0 ? `+${v}` : `−${v.slice(1)}`
}

export function pct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`
}
