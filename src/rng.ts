/**
 * Source d'aléatoire de la simulation. Les tests la remplacent par un générateur
 * à graine fixe pour obtenir des parties reproductibles.
 */
let source: () => number = Math.random;

export function random(): number {
  return source();
}

export function rand(min: number, max: number): number {
  return min + source() * (max - min);
}

/** Générateur déterministe (mulberry32). */
export function seedRandom(seed: number): void {
  let a = seed >>> 0;
  source = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function resetRandom(): void {
  source = Math.random;
}
