/** Сколько крупинок соли показать: мало соли видно сразу, большой чек не перегружает экран. */
export function saltGrainCount(grams: number): number {
  if (!Number.isFinite(grams) || grams <= 0) return 0;
  const estimate = grams <= 14 ? grams * 12 : 168 + 74 * Math.log1p((grams - 14) / 9);
  return Math.min(248, Math.max(1, Math.round(estimate)));
}
