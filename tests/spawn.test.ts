import { afterEach, describe, expect, it } from 'vitest';
import { BOSS_TYPES, ENEMY_TYPES } from '../src/enemies';
import { random, resetRandom, seedRandom } from '../src/rng';
import { BOSS_SPAWN_DISTANCE, MIN_SPAWN_DISTANCE, spawnOutside, squareExit } from '../src/spawn';
import { ARENA, FENCE } from '../src/world';
import { makeArena, makeRun, simulate } from './helpers';

afterEach(() => resetRandom());

/** Plus grande des deux coordonnées (distance au centre, en « carré » : c'est ce que la clôture dessine). */
const reach = (p: { x: number; z: number }): number => Math.max(Math.abs(p.x), Math.abs(p.z));

describe('sortie d’un carré', () => {
  it('depuis le centre, le rayon sort exactement sur le bord, dans toutes les directions', () => {
    for (let k = 0; k < 360; k++) {
      const angle = (k * Math.PI) / 180;
      const p = squareExit(0, 0, angle, 50);
      expect(reach(p)).toBeCloseTo(50, 9);
      // Le point est bien dans la direction demandée.
      expect(Math.atan2(p.z, p.x)).toBeCloseTo(Math.atan2(Math.sin(angle), Math.cos(angle)), 9);
    }
  });

  it('depuis un point excentré, le rayon sort sur le bord le plus proche dans sa direction', () => {
    expect(squareExit(40, 0, 0, 44)).toEqual({ x: 44, z: 0 });
    expect(squareExit(-40, 10, Math.PI, 44).x).toBeCloseTo(-44, 9);
    const corner = squareExit(40, 40, Math.PI / 4, 44);
    expect(corner.x).toBeCloseTo(44, 9);
    expect(corner.z).toBeCloseTo(44, 9);
  });

  it('les directions parfaitement alignées sur un axe (division par zéro évitée) fonctionnent', () => {
    expect(squareExit(3, 5, Math.PI / 2, 44).z).toBeCloseTo(44, 9);
    expect(squareExit(3, 5, -Math.PI / 2, 44).z).toBeCloseTo(-44, 9);
    expect(squareExit(3, 5, Math.PI, 44).x).toBeCloseTo(-44, 9);
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 2 * Math.PI]) {
      const p = squareExit(1, 1, angle, 44);
      expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    }
  });

  it('un héros déjà hors du carré (ne devrait pas arriver) ne donne pas de point absurde', () => {
    const p = squareExit(100, 0, 0, 44);
    expect(p).toEqual({ x: 100, z: 0 });
  });
});

describe('point d’apparition', () => {
  it('toujours hors du carré demandé, où que soit le héros (centre, bords, coins)', () => {
    seedRandom(5);
    const half = FENCE + 1;
    const spots = [[0, 0], [ARENA, 0], [-ARENA, 0], [0, ARENA], [0, -ARENA], [ARENA, ARENA], [-ARENA, -ARENA], [ARENA, -ARENA], [13, -27]];
    for (const [px, pz] of spots) {
      for (let k = 0; k < 300; k++) {
        const p = spawnOutside(px, pz, half, () => random() * Math.PI * 2);
        expect(reach(p)).toBeGreaterThanOrEqual(half - 1e-9);
      }
    }
  });

  it('jamais plus près du héros que la distance minimale (même collé à un bord ou dans un coin)', () => {
    seedRandom(6);
    for (const [px, pz] of [[0, 0], [ARENA, 0], [ARENA, ARENA], [-ARENA, ARENA], [20, -ARENA]]) {
      for (let k = 0; k < 300; k++) {
        const p = spawnOutside(px, pz, FENCE + 1, () => random() * Math.PI * 2);
        expect(Math.hypot(p.x - px, p.z - pz)).toBeGreaterThanOrEqual(MIN_SPAWN_DISTANCE - 1e-9);
      }
    }
  });

  it('du centre, les ennemis arrivent de tous les côtés', () => {
    seedRandom(7);
    const sides = new Set<string>();
    for (let k = 0; k < 400; k++) {
      const p = spawnOutside(0, 0, FENCE + 1, () => random() * Math.PI * 2);
      if (Math.abs(p.x) >= Math.abs(p.z)) sides.add(p.x > 0 ? 'est' : 'ouest');
      else sides.add(p.z > 0 ? 'sud' : 'nord');
    }
    expect([...sides].sort()).toEqual(['est', 'nord', 'ouest', 'sud']);
  });

  it('la distance minimale est de 3 unités pour les ennemis ordinaires et de 26 pour les boss', () => {
    expect(MIN_SPAWN_DISTANCE).toBe(3);
    expect(BOSS_SPAWN_DISTANCE).toBe(26);
  });

  it('collé à un bord, un ennemi ordinaire peut surgir derrière la clôture proche (à 3 unités ou plus), mais pas un boss', () => {
    seedRandom(11);
    let nearest = Infinity;
    for (let k = 0; k < 600; k++) {
      const p = spawnOutside(ARENA, 0, FENCE + 1, () => random() * Math.PI * 2);
      const distance = Math.hypot(p.x - ARENA, p.z);
      nearest = Math.min(nearest, distance);
      expect(distance).toBeGreaterThanOrEqual(MIN_SPAWN_DISTANCE - 1e-9);
      const boss = spawnOutside(ARENA, 0, FENCE + 1, () => random() * Math.PI * 2, BOSS_SPAWN_DISTANCE);
      expect(Math.hypot(boss.x - ARENA, boss.z)).toBeGreaterThanOrEqual(BOSS_SPAWN_DISTANCE - 1e-9);
    }
    // Il en naît bien près du héros (entre 3 et 26 unités) : c'est le but, la file venue de l'autre bout n'est plus la seule.
    expect(nearest).toBeLessThan(BOSS_SPAWN_DISTANCE);
  });

  it('collé à un bord, aucun ennemi n’apparaît à moins de 3 unités, derrière la clôture toute proche', () => {
    seedRandom(8);
    // Héros contre la clôture est : les directions vers l'est donneraient un point à 2,5 unités, elles sont écartées.
    for (let k = 0; k < 300; k++) {
      const p = spawnOutside(ARENA, 0, FENCE + 1, () => random() * Math.PI * 2);
      expect(Math.hypot(p.x - ARENA, p.z)).toBeGreaterThanOrEqual(MIN_SPAWN_DISTANCE - 1e-9);
    }
  });

  it('si aucune direction tirée ne convient, repart du côté opposé (vers le centre) au lieu d’échouer', () => {
    // Le tirage donne toujours « vers l'est », à 2,5 unités de la clôture : jamais assez loin.
    let calls = 0;
    const p = spawnOutside(ARENA, 0, FENCE + 1, () => (calls++, 0));
    expect(calls).toBe(9);
    expect(p.x).toBeLessThan(0);
    expect(Math.hypot(p.x - ARENA, p.z)).toBeGreaterThanOrEqual(MIN_SPAWN_DISTANCE);
    expect(reach(p)).toBeCloseTo(FENCE + 1, 9);
  });

  it('collé à un coin, la direction de repli sort toujours assez loin (aucun tirage ne peut échouer)', () => {
    for (let k = 0; k < 360; k++) {
      // Les huit premiers tirages sont mauvais (vers le coin), le neuvième parcourt toute la plage de l'écart.
      let calls = 0;
      const p = spawnOutside(ARENA, ARENA, FENCE + 1, () => (++calls <= 8 ? 0 : (k / 360) * 2 * Math.PI));
      expect(Math.hypot(p.x - ARENA, p.z - ARENA)).toBeGreaterThanOrEqual(MIN_SPAWN_DISTANCE);
      // Même pour un boss : la direction de repli, vers le centre, sort très loin.
      let bossCalls = 0;
      const boss = spawnOutside(ARENA, ARENA, FENCE + 1, () => (++bossCalls <= 8 ? 0 : (k / 360) * 2 * Math.PI), BOSS_SPAWN_DISTANCE);
      expect(Math.hypot(boss.x - ARENA, boss.z - ARENA)).toBeGreaterThanOrEqual(BOSS_SPAWN_DISTANCE);
    }
  });

  it('consomme un seul tirage quand la première direction convient (aléatoire reproductible)', () => {
    let calls = 0;
    spawnOutside(0, 0, FENCE + 1, () => (calls++, 1));
    expect(calls).toBe(1);
  });
});

describe('apparition des ennemis dans le jeu', () => {
  it('tous les types, boss compris, apparaissent entièrement hors de la clôture, où que soit le héros', () => {
    seedRandom(9);
    const { enemies } = makeArena();
    for (const [px, pz] of [[0, 0], [ARENA, ARENA], [-ARENA, 0], [0, ARENA], [17, -33]]) {
      for (const type of ENEMY_TYPES) {
        for (let k = 0; k < 30; k++) {
          const e = enemies.spawn(0, px, pz, type);
          // Le corps entier est dehors : le bord de l'ennemi est au-delà de la clôture, pas seulement son centre.
          expect(reach(e) - type.radius).toBeGreaterThan(FENCE);
          // 3 unités pour les ennemis ordinaires, 26 pour les boss.
          expect(Math.hypot(e.x - px, e.z - pz)).toBeGreaterThanOrEqual((type.boss ? BOSS_SPAWN_DISTANCE : MIN_SPAWN_DISTANCE) - 1e-9);
        }
      }
    }
  });

  it('au fil d’une partie entière, aucun ennemi ne naît dans l’arène', () => {
    seedRandom(10);
    const run = makeRun();
    run.player.invincible = true;
    const seen = new WeakSet<object>();
    let born = 0;
    simulate(run, 120, {
      onStep: () => {
        for (const e of run.enemies.list) {
          if (seen.has(e)) continue;
          seen.add(e);
          born++;
          // Premier pas déjà fait : l'ennemi a pu avancer d'au plus une image (vitesse max d'un boss en charge : 15 u/s).
          expect(reach(e) - e.type.radius).toBeGreaterThan(FENCE - 0.6);
        }
      },
    });
    expect(born).toBeGreaterThan(50);
  });

  it('un boss apparu derrière la clôture entre dans l’arène sans être ramené d’un coup', () => {
    seedRandom(11);
    const { enemies, player } = makeArena();
    const boss = enemies.spawn(0, 0, 0, BOSS_TYPES[0]);
    const before = reach(boss);
    expect(before).toBeGreaterThan(ARENA + 2);
    enemies.update(0.016, 0, player);
    // Un pas de marche (vitesse du boss × 1/60 s), pas un saut de plusieurs unités vers l'intérieur.
    expect(before - reach(boss)).toBeLessThan(0.2);
    expect(reach(boss)).toBeGreaterThan(ARENA + 2);
    // Puis il avance vers le héros, jusqu'à l'atteindre.
    let nearest = Infinity;
    for (let i = 0; i < 60 * 40; i++) {
      enemies.update(0.016, 0, player);
      nearest = Math.min(nearest, Math.hypot(boss.x - player.x, boss.z - player.z));
    }
    expect(nearest).toBeLessThan(5);
  });

  it('un boss ne s’éloigne jamais de l’arène : une charge vers l’extérieur est toujours stoppée', () => {
    const { enemies, player } = makeArena();
    const boss = enemies.spawn(0, 0, 0, BOSS_TYPES[0]);
    boss.x = ARENA;
    boss.z = 0;
    // La charge file vers l'extérieur (direction figée au moment de viser), le héros étant resté loin, au centre.
    boss.boss = { phase: 'charge', attack: 'charge', timer: 5, dirX: 1, dirZ: 0 };
    for (let i = 0; i < 120; i++) {
      enemies.update(0.016, 0, player);
      // Seul le boss compte ici : un ennemi ordinaire né derrière la clôture, juste à côté, le repousserait de quelques millièmes
      // d'unité vers l'extérieur (séparation entre ennemis) et ferait échouer ce test de temps en temps.
      enemies.list.splice(0, enemies.list.length, boss);
    }
    expect(boss.x).toBeLessThanOrEqual(ARENA + 2 + 1e-9);
  });
});
