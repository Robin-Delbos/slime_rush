/** Décélération douce : démarre vite, ralentit à l'arrivée. `t` va de 0 à 1. */
export function easeOutCubic(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return 1 - (1 - k) ** 3;
}

/** Valeur entière qui monte de `from` à `to` au fil de `t` (0 à 1), toujours arrondie vers le bas. */
export function countUp(from: number, to: number, t: number): number {
  if (t >= 1) return to;
  return Math.floor(from + (to - from) * easeOutCubic(t));
}
