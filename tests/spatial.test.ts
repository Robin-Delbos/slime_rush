import { afterEach, describe, expect, it } from 'vitest';
import { ENEMY_TYPES, MAX_ENEMIES } from '../src/enemies';
import { SpatialIndex, type Disc } from '../src/grid';
import { random, resetRandom, seedRandom } from '../src/rng';
import weaponsSource from '../src/weapons.ts?raw';
import { makeArena, makeRun, placeEnemy, simulate } from './helpers';

afterEach(() => resetRandom());

const RADII = ENEMY_TYPES.map((t) => t.radius);
const MAX_RADIUS = Math.max(...RADII);
const HALF = 120;

function scene(count: number, side: number, seed: number): Disc[] {
  seedRandom(seed);
  return Array.from({ length: count }, () => ({ x: (random() - 0.5) * side, z: (random() - 0.5) * side, radius: RADII[Math.floor(random() * RADII.length)] }));
}

/** Parcours complet : les indices des disques touchés par un cercle de rayon `reach` en (x, z), dans l'ordre. */
function touched(list: Disc[], x: number, z: number, reach: number): number[] {
  const out: number[] = [];
  list.forEach((d, i) => {
    if (Math.hypot(d.x - x, d.z - z) < d.radius + reach) out.push(i);
  });
  return out;
}

function query(index: SpatialIndex, x: number, z: number, reach: number, capacity = MAX_ENEMIES): number[] {
  const out = new Int32Array(capacity);
  return Array.from(out.subarray(0, index.query(x, z, reach, out)));
}

const isAscending = (ids: number[]): boolean => ids.every((id, k) => k === 0 || ids[k - 1] < id);

describe('index spatial des armes : même réponse qu’un parcours complet', () => {
  it.each([0.2, 0.5, 1, 2, 3.5, 6, 12, 40, 500])('rayon de recherche %f : tous les ennemis touchés sont renvoyés, une seule fois, dans l’ordre', (reach) => {
    for (let seed = 1; seed <= 6; seed++) {
      const list = scene(300, 70, seed);
      const index = new SpatialIndex(MAX_RADIUS, HALF, MAX_ENEMIES);
      index.rebuild(list);
      for (let k = 0; k < 25; k++) {
        const x = (random() - 0.5) * 80;
        const z = (random() - 0.5) * 80;
        const ids = query(index, x, z, reach);
        expect(isAscending(ids)).toBe(true);
        const expected = touched(list, x, z, reach);
        expect(ids).toEqual(expect.arrayContaining(expected));
      }
    }
  });

  it('il ne renvoie qu’une petite partie de la liste pour une recherche proche (c’est tout l’intérêt)', () => {
    const list = scene(300, 80, 3);
    const index = new SpatialIndex(MAX_RADIUS, HALF, MAX_ENEMIES);
    index.rebuild(list);
    const sizes = Array.from({ length: 40 }, () => query(index, (random() - 0.5) * 80, (random() - 0.5) * 80, 0.5).length);
    expect(Math.max(...sizes)).toBeLessThan(60);
    expect(sizes.reduce((a, b) => a + b, 0) / sizes.length).toBeLessThan(25);
  });

  it('les reculs infligés après le rangement sont suivis : aucun ennemi touché n’est oublié', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const list = scene(250, 40, seed);
      const index = new SpatialIndex(MAX_RADIUS, HALF, MAX_ENEMIES);
      index.rebuild(list);
      for (let step = 0; step < 200; step++) {
        // Un coup : l'ennemi recule d'au plus 0,5 (valeur du jeu : 0,18 / rayon, avec une direction de norme 1).
        const hit = list[Math.floor(random() * list.length)];
        const angle = random() * Math.PI * 2;
        const knock = random() * 0.5;
        hit.x += Math.cos(angle) * knock;
        hit.z += Math.sin(angle) * knock;
        index.noteMove(knock * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle))));
        const x = hit.x + (random() - 0.5) * 3;
        const z = hit.z + (random() - 0.5) * 3;
        const reach = random() * 4;
        expect(query(index, x, z, reach)).toEqual(expect.arrayContaining(touched(list, x, z, reach)));
      }
    }
  });

  it('si les déplacements dépassent ce que les cases couvrent, la recherche élargit jusqu’à tous les ennemis (toujours exacte)', () => {
    const list = scene(120, 60, 5);
    const index = new SpatialIndex(MAX_RADIUS, HALF, MAX_ENEMIES);
    index.rebuild(list);
    index.noteMove(500);
    expect(query(index, 0, 0, 0.5)).toEqual(list.map((_, i) => i));
  });

  it('un nouveau rangement oublie les déplacements d’avant', () => {
    const list = scene(120, 60, 6);
    const index = new SpatialIndex(MAX_RADIUS, HALF, MAX_ENEMIES);
    index.rebuild(list);
    index.noteMove(500);
    index.rebuild(list);
    expect(query(index, 0, 0, 0.5).length).toBeLessThan(list.length);
  });

  it('liste vide, ennemis très loin de la zone, positions invalides : rien ne casse', () => {
    const index = new SpatialIndex(MAX_RADIUS, HALF, MAX_ENEMIES);
    index.rebuild([]);
    expect(query(index, 0, 0, 5)).toEqual([]);

    const far: Disc[] = [{ x: 5000, z: 0, radius: 0.5 }, { x: 5000.4, z: 0.2, radius: 0.5 }, { x: -9000, z: 40, radius: 0.5 }];
    index.rebuild(far);
    expect(query(index, 5000.1, 0, 0.3)).toEqual(expect.arrayContaining([0, 1]));

    index.rebuild([{ x: Number.NaN, z: 0, radius: 0.5 }, { x: 1, z: 1, radius: 0.5 }]);
    expect(() => query(index, 1, 1, 0.5)).not.toThrow();
    expect(query(index, 1, 1, 0.5)).toContain(1);
  });

  it('un rayon plus grand que prévu (futur géant) reste correct', () => {
    const list: Disc[] = [...scene(100, 40, 8), { x: 3, z: 3, radius: 9 }];
    const index = new SpatialIndex(MAX_RADIUS, HALF, MAX_ENEMIES);
    index.rebuild(list);
    for (let k = 0; k < 40; k++) {
      const x = (random() - 0.5) * 40;
      const z = (random() - 0.5) * 40;
      expect(query(index, x, z, 1)).toEqual(expect.arrayContaining(touched(list, x, z, 1)));
    }
  });

  it('plus d’ennemis que la capacité prévue : l’index s’agrandit', () => {
    const list = scene(500, 100, 9);
    const index = new SpatialIndex(MAX_RADIUS, HALF, 10);
    index.rebuild(list);
    expect(query(index, 0, 0, 500, 500)).toHaveLength(500);
  });
});

describe('ennemis : recherche à proximité', () => {
  it('trouve un ennemi apparu après le rangement (garde-fou), dans l’ordre de la liste', () => {
    const { enemies } = makeArena();
    const a = placeEnemy(enemies, 0, 0);
    placeEnemy(enemies, 30, 30);
    enemies.reindex();
    const late = placeEnemy(enemies, 0.5, 0);
    const count = enemies.nearby(0, 0, 1);
    const ids = Array.from(enemies.nearIds.subarray(0, count));
    expect(ids).toEqual([0, 2]);
    expect(enemies.list[ids[0]]).toBe(a);
    expect(enemies.list[ids[1]]).toBe(late);
  });

  it('un recul (hit) déplace l’ennemi : la recherche suivante le retrouve quand même', () => {
    const { enemies } = makeArena();
    const target = placeEnemy(enemies, 4.7, 0);
    for (let i = 0; i < 30; i++) placeEnemy(enemies, 40 + i, 40);
    enemies.reindex();
    // Dix coups de suite le font reculer de plusieurs unités, bien au-delà de sa case d'origine.
    for (let k = 0; k < 10; k++) enemies.hit(target, 0, 1, 0);
    const moved = target.x;
    expect(moved).toBeGreaterThan(4.7 + 2);
    const count = enemies.nearby(moved, 0, 0.5);
    expect(Array.from(enemies.nearIds.subarray(0, count))).toContain(0);
  });
});

describe('armes : le résultat d’une partie est exactement celui du parcours complet', () => {
  /** Même graine, même partie ; `brute` force la recherche à renvoyer tous les ennemis (l'ancien parcours complet). */
  function play(seed: number, brute: boolean): string {
    seedRandom(seed);
    const run = makeRun();
    run.player.invincible = true;
    for (const id of ['rifle', 'spear', 'orbs', 'aura', 'mines']) for (let level = 0; level < 3; level++) run.weapons.levelUp(id);
    for (let i = 0; i < 160; i++) run.enemies.spawn(100, 0, 0);
    if (brute) {
      run.enemies.nearby = function (this: typeof run.enemies): number {
        if (this.nearIds.length < this.list.length) this.nearIds = new Int32Array(this.list.length);
        for (let i = 0; i < this.list.length; i++) this.nearIds[i] = i;
        return this.list.length;
      };
    }
    simulate(run, 25);
    return JSON.stringify({
      kills: run.kills,
      gold: run.gold,
      level: run.level,
      time: run.time,
      hp: run.player.hp,
      enemies: run.enemies.list.map((e) => [e.type.id, e.x, e.z, e.hp]),
    });
  }

  it.each([1, 2, 3])('graine %i : mêmes morts, même or, mêmes positions et mêmes PV après 25 secondes', (seed) => {
    const withIndex = play(seed, false);
    const full = play(seed, true);
    expect(JSON.parse(withIndex).kills).toBeGreaterThan(20);
    expect(withIndex).toBe(full);
  });

  it('les armes passent par l’index (et non plus par un parcours de toute la liste)', () => {
    expect(weaponsSource).toContain('enemies.reindex()');
    expect(weaponsSource.match(/enemies\.nearby\(/g)?.length).toBeGreaterThanOrEqual(5);
  });
});
