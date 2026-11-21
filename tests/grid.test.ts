import { afterEach, describe, expect, it } from 'vitest';
import enemiesSource from '../src/enemies.ts?raw';
import { ENEMY_TYPES, MAX_ENEMIES } from '../src/enemies';
import { SeparationGrid, separateBruteForce, type Disc } from '../src/grid';
import { random, resetRandom, seedRandom } from '../src/rng';

afterEach(() => resetRandom());

const RADII = ENEMY_TYPES.map((t) => t.radius);
const MAX_RADIUS = Math.max(...RADII);
const HALF = 120;

/** Une scène aléatoire reproductible : `count` disques dans un carré de `side` unités, rayons pris parmi ceux des ennemis. */
function scene(count: number, side: number, seed: number, radii: number[] = RADII): Disc[] {
  seedRandom(seed);
  const discs: Disc[] = [];
  for (let i = 0; i < count; i++) {
    discs.push({ x: (random() - 0.5) * side, z: (random() - 0.5) * side, radius: radii[Math.floor(random() * radii.length)] });
  }
  return discs;
}

const copy = (discs: Disc[]): Disc[] => discs.map((d) => ({ ...d }));

/** Écart maximal de position entre deux scènes. */
function maxDifference(a: Disc[], b: Disc[]): number {
  return Math.max(0, ...a.map((d, i) => Math.max(Math.abs(d.x - b[i].x), Math.abs(d.z - b[i].z))));
}

/** Somme des chevauchements : sert à vérifier que la séparation fait bien son travail. */
function totalOverlap(discs: Disc[]): number {
  let total = 0;
  for (let i = 0; i < discs.length; i++) {
    for (let j = i + 1; j < discs.length; j++) {
      const d = Math.hypot(discs[i].x - discs[j].x, discs[i].z - discs[j].z);
      total += Math.max(0, discs[i].radius + discs[j].radius - d);
    }
  }
  return total;
}

describe('grille de séparation : même résultat que la méthode d’origine', () => {
  it.each([
    [2, 3],
    [10, 6],
    [50, 12],
    [300, 80],
    [300, 60],
  ])('%i ennemis dans un carré de %i : positions identiques', (count, side) => {
    for (let seed = 1; seed <= 12; seed++) {
      const expected = scene(count, side, seed);
      const actual = copy(expected);
      separateBruteForce(expected);
      new SeparationGrid(MAX_RADIUS, HALF, MAX_ENEMIES).separate(actual);
      expect(maxDifference(expected, actual)).toBeLessThan(1e-9);
    }
  });

  it('une horde qui se resserre image après image, comme en jeu : positions identiques à chaque image', () => {
    // En jeu, les ennemis sont déjà séparés à l'image précédente : on part d'une foule détendue, puis chaque image
    // ils avancent un peu vers le héros (1 % de la distance, soit environ 0,15 unité) avant de se séparer.
    const expected = scene(250, 40, 7);
    for (let pass = 0; pass < 80; pass++) separateBruteForce(expected);
    const actual = copy(expected);
    const grid = new SeparationGrid(MAX_RADIUS, HALF, MAX_ENEMIES);
    for (let frame = 0; frame < 40; frame++) {
      for (const set of [expected, actual]) for (const d of set) (d.x *= 0.99), (d.z *= 0.99);
      separateBruteForce(expected);
      grid.separate(actual);
      expect(maxDifference(expected, actual)).toBeLessThan(1e-9);
    }
  });

  it('une foule hors du commun (tous les ennemis se chevauchent au départ) est séparée aussi bien que par la méthode d’origine', () => {
    // Ici un ennemi peut être poussé de plusieurs unités en un passage : les positions peuvent différer un peu de la méthode
    // d’origine (une paire manquée est rattrapée à l'image suivante), mais le chevauchement final doit être comparable.
    for (const [count, side] of [[150, 25], [300, 30], [500, 40]] as const) {
      const expected = scene(count, side, 21);
      const actual = copy(expected);
      const before = totalOverlap(expected);
      separateBruteForce(expected);
      new SeparationGrid(MAX_RADIUS, HALF, MAX_ENEMIES).separate(actual);
      const reference = totalOverlap(expected);
      expect(totalOverlap(actual)).toBeLessThan(reference * 1.25 + 1);
      // Après quelques dizaines d'images, la foule est aussi dégagée qu'avec la méthode d'origine .
      const grid = new SeparationGrid(MAX_RADIUS, HALF, MAX_ENEMIES);
      for (let pass = 0; pass < 60; pass++) {
        separateBruteForce(expected);
        grid.separate(actual);
      }
      expect(totalOverlap(actual)).toBeLessThan(totalOverlap(expected) * 1.5 + 1);
    }
  });

  it('les boss (grand rayon) au milieu de la foule', () => {
    const expected = scene(120, 18, 3, [0.5, 0.4, 0.95, 1.9, 1.6]);
    const actual = copy(expected);
    separateBruteForce(expected);
    new SeparationGrid(MAX_RADIUS, HALF, MAX_ENEMIES).separate(actual);
    expect(maxDifference(expected, actual)).toBeLessThan(1e-9);
  });
});

describe('grille de séparation : cas limites', () => {
  const grid = () => new SeparationGrid(MAX_RADIUS, HALF, MAX_ENEMIES);

  it('liste vide ou d’un seul ennemi : rien à faire', () => {
    const one = [{ x: 1, z: 2, radius: 0.5 }];
    grid().separate([]);
    grid().separate(one);
    expect(one[0]).toEqual({ x: 1, z: 2, radius: 0.5 });
  });

  it('deux ennemis qui se chevauchent s’écartent exactement du chevauchement, chacun de moitié', () => {
    const a = { x: 0, z: 0, radius: 0.5 };
    const b = { x: 0.6, z: 0, radius: 0.5 };
    grid().separate([a, b]);
    expect(b.x - a.x).toBeCloseTo(1, 9);
    expect(a.x).toBeCloseTo(-0.2, 9);
    expect(b.x).toBeCloseTo(0.8, 9);
  });

  it('deux ennemis pile au même endroit sont laissés (pas de direction), sans erreur', () => {
    const list = [{ x: 3, z: 3, radius: 0.5 }, { x: 3, z: 3, radius: 0.5 }];
    grid().separate(list);
    expect(list[0]).toEqual({ x: 3, z: 3, radius: 0.5 });
    expect(Number.isNaN(list[1].x)).toBe(false);
  });

  it('des ennemis loin hors de la zone couverte sont quand même séparés (rangés dans la case du bord)', () => {
    for (const [x, z] of [[1000, 0], [-1000, 5], [0, 4000], [HALF - 0.1, HALF + 50]] as const) {
      const a = { x, z, radius: 0.5 };
      const b = { x: x + 0.4, z, radius: 0.5 };
      grid().separate([a, b]);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(1, 9);
    }
  });

  it('un ennemi juste dedans et un juste dehors, de part et d’autre du bord de la grille, se séparent', () => {
    const a = { x: HALF - 0.2, z: 0, radius: 0.5 };
    const b = { x: HALF + 0.3, z: 0, radius: 0.5 };
    grid().separate([a, b]);
    expect(b.x - a.x).toBeCloseTo(1, 9);
  });

  it('une position invalide (NaN) ne fait pas planter et n’empêche pas les autres de se séparer', () => {
    const a = { x: 0, z: 0, radius: 0.5 };
    const b = { x: 0.3, z: 0, radius: 0.5 };
    const broken = { x: Number.NaN, z: 0, radius: 0.5 };
    expect(() => grid().separate([broken, a, b])).not.toThrow();
    expect(b.x - a.x).toBeCloseTo(1, 9);
  });

  it('un rayon plus grand que prévu (futur boss géant) retombe sur la méthode lente, donc reste exact', () => {
    const expected = scene(60, 14, 5, [0.5, 0.95, 6]);
    const actual = copy(expected);
    separateBruteForce(expected);
    const g = grid();
    g.separate(actual);
    expect(maxDifference(expected, actual)).toBeLessThan(1e-9);
    expect(g.checks).toBe((60 * 59) / 2);
  });

  it('plus d’ennemis que la capacité prévue : la grille s’agrandit', () => {
    const expected = scene(500, 110, 9);
    const actual = copy(expected);
    separateBruteForce(expected);
    new SeparationGrid(MAX_RADIUS, HALF, 10).separate(actual);
    expect(maxDifference(expected, actual)).toBeLessThan(1e-9);
  });

  it('un tas d’ennemis presque au même point se disperse et reste fini', () => {
    seedRandom(11);
    const pile: Disc[] = Array.from({ length: 100 }, () => ({ x: (random() - 0.5) * 0.4, z: (random() - 0.5) * 0.4, radius: 0.5 }));
    const before = totalOverlap(pile);
    const g = grid();
    for (let pass = 0; pass < 40; pass++) g.separate(pile);
    expect(pile.every((d) => Number.isFinite(d.x) && Number.isFinite(d.z))).toBe(true);
  });
});

describe('grille de séparation : le travail évité', () => {
  it('300 ennemis répartis dans l’arène : moins de 5 % des paires sont testées', () => {
    const list = scene(300, 80, 4);
    const grid = new SeparationGrid(MAX_RADIUS, HALF, MAX_ENEMIES);
    grid.separate(list);
    const all = (300 * 299) / 2;
    expect(grid.checks).toBeGreaterThan(0);
    expect(grid.checks).toBeLessThan(all * 0.05);
  });

  it('300 ennemis tous serrés autour du héros : encore bien moins que toutes les paires', () => {
    const list = scene(300, 14, 4);
    const grid = new SeparationGrid(MAX_RADIUS, HALF, MAX_ENEMIES);
    grid.separate(list);
    expect(grid.checks).toBeLessThanOrEqual((300 * 299) / 2);
  });

  it('les ennemis du jeu utilisent la grille', () => {
    expect(enemiesSource).toContain('this.grid.separate(this.list)');
    expect(enemiesSource).toContain('new SeparationGrid(');
  });
});
