import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_ENEMIES } from '../src/enemies';
import { baseStats } from '../src/player';
import { resetRandom, seedRandom } from '../src/rng';
import { SPECIAL_COST, SPECIAL_DAMAGE, SPECIAL_RADIUS, xpForLevel } from '../src/run';
import { UPGRADES } from '../src/upgrades';
import { ARENA } from '../src/world';
import { STILL, enemyType, makeRun, placeEnemy, simulate } from './helpers';

beforeEach(() => seedRandom(1234));
afterEach(() => resetRandom());

describe('Run : simulation complète', () => {
  it('fait apparaître des ennemis, en tue, et fait monter le héros de niveau', () => {
    const run = makeRun();
    simulate(run, 60);
    expect(run.time).toBeGreaterThan(20);
    expect(run.kills).toBeGreaterThan(10);
    expect(run.level).toBeGreaterThan(1);
    expect(run.enemies.list.length).toBeGreaterThan(0);
  });

  it('garde un état cohérent pendant toute une partie', () => {
    const run = makeRun();
    simulate(run, 120, {
      onStep: () => {
        const { player } = run;
        expect(Number.isFinite(player.x) && Number.isFinite(player.z)).toBe(true);
        expect(Math.abs(player.x)).toBeLessThanOrEqual(ARENA);
        expect(Math.abs(player.z)).toBeLessThanOrEqual(ARENA);
        expect(player.hp).toBeLessThanOrEqual(player.stats.maxHp);
        expect(player.hp).toBeGreaterThanOrEqual(0);
        expect(run.enemies.list.length).toBeLessThanOrEqual(MAX_ENEMIES);
        expect(run.gold).toBeGreaterThanOrEqual(0);
        for (const e of run.enemies.list) expect(Number.isFinite(e.x) && Number.isFinite(e.z)).toBe(true);
      },
    });
  });

  it('se termine quand le héros immobile est submergé', () => {
    const run = makeRun();
    let gameOvers = 0;
    run.events.onGameOver = () => gameOvers++;
    simulate(run, 900, { move: false, dt: 1 / 20 });
    expect(run.over).toBe(true);
    expect(run.player.hp).toBe(0);
    expect(gameOvers).toBe(1);

    // Une partie terminée ne bouge plus.
    const time = run.time;
    run.update(0.1, STILL);
    expect(run.time).toBe(time);
  });

  it('est reproductible avec la même graine', () => {
    const play = () => {
      seedRandom(42);
      const run = makeRun();
      simulate(run, 45);
      return { kills: run.kills, level: run.level, xp: run.xp, gold: run.gold, x: run.player.x, hp: run.player.hp };
    };
    expect(play()).toEqual(play());
  });
});

describe('Run : montée de niveau', () => {
  it('se met en pause tant que le joueur n’a pas choisi son amélioration', () => {
    const run = makeRun();
    run.xp = run.xpNeeded;
    run.update(0.016, STILL);
    expect(run.level).toBe(2);
    expect(run.pendingChoices).toHaveLength(3);

    const time = run.time;
    run.update(0.5, STILL);
    expect(run.time).toBe(time);
  });

  it('applique l’amélioration choisie et reprend', () => {
    const run = makeRun();
    run.xp = run.xpNeeded;
    run.update(0.016, STILL);
    const choice = run.pendingChoices![0];
    const before = JSON.stringify(run.player.stats);

    run.choose(choice);
    expect(run.pendingChoices).toBeNull();
    expect(run.upgradeLevels.get(choice.id)).toBe(1);
    expect(JSON.stringify(run.player.stats)).not.toBe(before);

    const time = run.time;
    run.update(0.016, STILL);
    expect(run.time).toBeGreaterThan(time);
  });

  it('refuse une amélioration qui n’était pas proposée', () => {
    const run = makeRun();
    run.xp = run.xpNeeded;
    run.update(0.016, STILL);
    const outsider = UPGRADES.find((u) => !run.pendingChoices!.includes(u))!;
    run.choose(outsider);
    expect(run.pendingChoices).not.toBeNull();
    expect(run.upgradeLevels.size).toBe(0);
  });

  it('conserve le surplus d’XP et prévient par un événement', () => {
    const levels: number[] = [];
    const run = makeRun({ onLevelUp: (level) => levels.push(level) });
    run.xp = run.xpNeeded + 2;
    run.update(0.016, STILL);
    expect(run.xp).toBeCloseTo(2);
    expect(levels).toEqual([2]);
  });

  it('demande de plus en plus d’XP à chaque niveau', () => {
    for (let level = 1; level < 30; level++) expect(xpForLevel(level + 1)).toBeGreaterThan(xpForLevel(level));
  });

  it('donne un soin quand toutes les améliorations sont au maximum', () => {
    const run = makeRun();
    for (const u of UPGRADES) run.upgradeLevels.set(u.id, u.max);
    run.player.hp = 50;
    run.xp = run.xpNeeded;
    run.update(0.016, STILL);
    expect(run.pendingChoices).toBeNull();
    expect(run.player.hp).toBeCloseTo(70, 0);
  });
});

describe('Run : attaque spéciale', () => {
  it('ne se déclenche pas tant que la jauge n’est pas pleine', () => {
    const run = makeRun();
    const slime = placeEnemy(run.enemies, 3, 0);
    run.charge = 0.99;
    expect(run.castSpecial(3, 0)).toBe(false);
    expect(slime.hp).toBe(slime.type.hp);
    expect(run.charge).toBe(0.99);
  });

  it('blesse et repousse les ennemis dans le rayon, pas au-delà', () => {
    const casts: number[][] = [];
    const run = makeRun({ onSpecial: (x, z, radius) => casts.push([x, z, radius]) });
    const inside = placeEnemy(run.enemies, 8, 0, enemyType('orc'));
    const outside = placeEnemy(run.enemies, 6 + SPECIAL_RADIUS + 3, 0, enemyType('orc'));
    run.charge = 1;

    expect(run.castSpecial(6, 0)).toBe(true);
    expect(inside.hp).toBeCloseTo(inside.type.hp - run.player.stats.damage * SPECIAL_DAMAGE);
    expect(inside.x).toBeGreaterThan(8);
    expect(outside.hp).toBe(outside.type.hp);
    expect(run.charge).toBe(0);
    expect(casts).toEqual([[6, 0, SPECIAL_RADIUS]]);
  });

  it('se recharge en tuant des ennemis et prévient quand elle est prête', () => {
    let ready = 0;
    const run = makeRun({ onSpecialReady: () => ready++ });
    const kill = (count: number) => {
      for (let i = 0; i < count; i++) placeEnemy(run.enemies, 30, i).hp = 0;
      run.update(0.001, STILL);
    };
    kill(SPECIAL_COST / 2);
    expect(run.charge).toBeCloseTo(0.5);
    expect(run.specialReady).toBe(false);
    kill(SPECIAL_COST);
    expect(run.charge).toBe(1);
    expect(ready).toBe(1);
  });

  it('ne se recharge pas avec ses propres victimes', () => {
    const run = makeRun();
    for (let i = 0; i < 40; i++) placeEnemy(run.enemies, 20, i * 0.01);
    run.charge = 1;
    run.castSpecial(20, 0);
    run.update(0.001, STILL);
    expect(run.kills).toBe(40);
    expect(run.charge).toBe(0);
  });

  it('repart vide à chaque partie', () => {
    const run = makeRun();
    run.charge = 1;
    run.reset();
    expect(run.charge).toBe(0);
  });
});

describe('Run : gains et remise à zéro', () => {
  it('applique les multiplicateurs d’or et d’XP', () => {
    const run = makeRun();
    run.reset({ ...baseStats(), goldMult: 2, xpMult: 3 });
    run.pickups.spawn('gold', 0, 0, 5);
    run.pickups.spawn('xp', 0, 0, 1);
    run.update(0.016, STILL);
    expect(run.gold).toBe(10);
    expect(run.xp).toBe(3);
  });

  it('compte les morts et prévient par un événement', () => {
    let killed = 0;
    const run = makeRun({ onEnemyKilled: () => killed++ });
    simulate(run, 40);
    expect(killed).toBe(run.kills);
    expect(killed).toBeGreaterThan(0);
  });

  it('repart de zéro avec reset()', () => {
    const run = makeRun();
    simulate(run, 40);
    run.reset({ ...baseStats(), maxHp: 150 });
    expect(run.time).toBe(0);
    expect(run.kills).toBe(0);
    expect(run.level).toBe(1);
    expect(run.gold).toBe(0);
    expect(run.over).toBe(false);
    expect(run.enemies.list).toHaveLength(0);
    expect(run.pickups.count).toBe(0);
    expect(run.upgradeLevels.size).toBe(0);
    expect(run.player.hp).toBe(150);
    expect(run.player.x).toBe(0);
  });
});
