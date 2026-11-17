import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BOSS_TYPES, MAX_ENEMIES } from '../src/enemies';
import { baseStats } from '../src/player';
import { resetRandom, seedRandom } from '../src/rng';
import {
  BOSS_COINS,
  BOSS_GEMS,
  BOSS_INTERVAL,
  BOSS_SPACING,
  LEGEND_BOOST,
  LEGEND_LEVEL,
  LEGEND_TIME,
  MAX_BOSSES,
  LEVEL_HEAL,
  SPECIAL_COST,
  SPECIAL_DAMAGE,
  SPECIAL_RADIUS,
  xpForLevel,
} from '../src/run';
import { PASSIVES, WEAPON_PREFIX, type Upgrade } from '../src/upgrades';
import { WEAPONS } from '../src/weaponData';
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
    const before = run.upgradeLevels.get(choice.id) ?? 0;

    run.choose(choice);
    expect(run.pendingChoices).toBeNull();
    expect(run.upgradeLevels.get(choice.id)).toBe(before + 1);
    if (choice.id.startsWith(WEAPON_PREFIX)) {
      expect(run.weapons.level(choice.id.slice(WEAPON_PREFIX.length))).toBe(before + 1);
    }

    const time = run.time;
    run.update(0.016, STILL);
    expect(run.time).toBeGreaterThan(time);
  });

  it('refuse une amélioration qui n’était pas proposée', () => {
    const run = makeRun();
    run.xp = run.xpNeeded;
    run.update(0.016, STILL);
    const outsider: Upgrade = { ...PASSIVES[0], id: 'intrus', apply: () => {} };
    const levels = new Map(run.upgradeLevels);
    run.choose(outsider);
    expect(run.pendingChoices).not.toBeNull();
    expect(run.upgradeLevels).toEqual(levels);
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

  it('ne propose aucune carte quand toutes les améliorations sont au maximum, mais soigne quand même', () => {
    const run = makeRun();
    for (const u of PASSIVES) run.upgradeLevels.set(u.id, u.max);
    for (const w of WEAPONS) run.upgradeLevels.set(WEAPON_PREFIX + w.id, w.levels.length);
    run.player.hp = 50;
    run.xp = run.xpNeeded;
    run.update(0.016, STILL);
    expect(run.level).toBe(2);
    expect(run.pendingChoices).toBeNull();
    expect(run.player.hp).toBeCloseTo(50 + run.player.stats.maxHp * LEVEL_HEAL, 0);
    // La partie continue sans interruption.
    const time = run.time;
    run.update(0.1, STILL);
    expect(run.time).toBeGreaterThan(time);
  });

  it('rend 10 % des PV max à chaque niveau, dès le premier', () => {
    expect(LEVEL_HEAL).toBe(0.1);
    const run = makeRun();
    run.player.hp = 20;
    run.xp = run.xpNeeded;
    run.update(0.016, STILL);
    expect(run.level).toBe(2);
    expect(run.player.hp).toBeCloseTo(20 + run.player.stats.maxHp * 0.1, 0);
    expect(run.pendingChoices).not.toBeNull();
  });

  it('ne dépasse jamais les PV max en soignant', () => {
    const run = makeRun();
    run.player.hp = run.player.stats.maxHp - 3;
    run.xp = run.xpNeeded;
    run.update(0.016, STILL);
    expect(run.player.hp).toBe(run.player.stats.maxHp);
  });

  it('soigne en proportion des PV max du moment', () => {
    const run = makeRun();
    run.player.stats.maxHp = 400;
    run.player.hp = 100;
    run.xp = run.xpNeeded;
    run.update(0.016, STILL);
    expect(run.player.hp).toBeCloseTo(140, 0);
  });

  it('propose les améliorations classiques tant qu’il en reste', () => {
    const run = makeRun();
    run.xp = run.xpNeeded;
    run.update(0.016, STILL);
    expect(run.pendingChoices).toHaveLength(3);
  });
});

describe('Run : niveau 100 et mode Légende', () => {
  /** Amène la partie juste avant le niveau 100, puis le franchit. */
  const reachLegend = (run: ReturnType<typeof makeRun>) => {
    run.level = LEGEND_LEVEL - 1;
    run.xp = run.xpNeeded;
    run.update(0.016, STILL);
  };

  it('ne se déclenche pas avant le niveau 100', () => {
    const run = makeRun();
    run.level = LEGEND_LEVEL - 2;
    run.xp = run.xpNeeded;
    run.update(0.016, STILL);
    expect(run.level).toBe(LEGEND_LEVEL - 1);
    expect(run.legendTime).toBe(0);
    expect(run.legendReached).toBe(false);
    expect(run.player.invincible).toBe(false);
  });

  it('démarre au niveau 100, sans carte à choisir, et prévient une seule fois', () => {
    let starts = 0;
    const run = makeRun({ onLegend: () => starts++ });
    reachLegend(run);
    expect(run.level).toBe(LEGEND_LEVEL);
    expect(starts).toBe(1);
    expect(run.legendReached).toBe(true);
    expect(run.legendTime).toBeCloseTo(LEGEND_TIME, 0);
    expect(run.pendingChoices).toBeNull();
  });

  it('rend le héros invincible et très puissant', () => {
    const run = makeRun();
    const base = { ...run.player.stats };
    reachLegend(run);
    const stats = run.player.stats;
    expect(run.player.invincible).toBe(true);
    expect(stats.damage).toBeCloseTo(base.damage * LEGEND_BOOST.damage);
    expect(stats.cooldown).toBeCloseTo(base.cooldown * LEGEND_BOOST.cooldown);
    expect(stats.speed).toBeCloseTo(base.speed * LEGEND_BOOST.speed);
    expect(stats.magnet).toBeCloseTo(base.magnet * LEGEND_BOOST.magnet);

    // Un ennemi collé au héros ne lui fait rien, ni un coup direct.
    const slime = placeEnemy(run.enemies, 0.3, 0);
    slime.hp = 1e9;
    for (let i = 0; i < 100; i++) run.update(0.05, STILL);
    expect(run.player.hp).toBe(stats.maxHp);
    run.player.takeDamage(1e6);
    expect(run.player.hp).toBe(stats.maxHp);
    expect(run.over).toBe(false);
  });

  it('ne donne aucun bonus de pièces', () => {
    const run = makeRun();
    reachLegend(run);
    expect(run.gold).toBe(0);
    expect(run.player.stats.goldMult).toBe(baseStats().goldMult);
  });

  it('dure 60 secondes, puis la partie reprend comme avant', () => {
    let ends = 0;
    const run = makeRun({ onLegendEnd: () => ends++ });
    const base = { ...run.player.stats };
    reachLegend(run);
    // Héros immobile : on ne veut pas qu'une montée de niveau fige le décompte.
    for (let t = 0; t < LEGEND_TIME - 1; t += 0.5) {
      run.update(0.5, STILL);
      run.pendingChoices = null;
    }
    expect(run.legendTime).toBeGreaterThan(0);
    expect(run.player.invincible).toBe(true);
    for (let t = 0; t < 3; t += 0.5) {
      run.update(0.5, STILL);
      run.pendingChoices = null;
    }
    expect(ends).toBe(1);
    expect(run.legendTime).toBe(0);
    expect(run.player.invincible).toBe(false);
    for (const key of ['damage', 'cooldown', 'speed', 'magnet'] as const) {
      expect(run.player.stats[key], key).toBeCloseTo(base[key]);
    }
    // Le héros peut de nouveau être blessé (des ennemis ont pu le toucher pendant les dernières secondes).
    run.player.hp = run.player.stats.maxHp;
    run.player.takeDamage(10);
    expect(run.player.hp).toBe(run.player.stats.maxHp - 10);
  });

  it('ne se redéclenche pas aux niveaux suivants', () => {
    let starts = 0;
    const run = makeRun({ onLegend: () => starts++ });
    run.player.stats.maxHp = run.player.hp = 1e9;
    reachLegend(run);
    for (let t = 0; t < LEGEND_TIME + 1; t += 0.5) {
      run.update(0.5, STILL);
      run.pendingChoices = null;
    }
    run.xp = run.xpNeeded;
    run.update(0.016, STILL);
    expect(run.level).toBeGreaterThan(LEGEND_LEVEL);
    expect(starts).toBe(1);
    expect(run.legendTime).toBe(0);
    // Au-delà, les niveaux proposent de nouveau des cartes.
    expect(run.pendingChoices).not.toBeNull();
  });

  it('se remet à zéro avec la partie', () => {
    const run = makeRun();
    reachLegend(run);
    run.reset();
    expect(run.legendTime).toBe(0);
    expect(run.legendReached).toBe(false);
    expect(run.player.invincible).toBe(false);
    expect(run.player.stats.damage).toBe(baseStats().damage);
  });

  it('tue plus vite : un boss tombe en quelques secondes pendant le mode', () => {
    const run = makeRun();
    run.player.stats.maxHp = run.player.hp = 1e9;
    reachLegend(run);
    const boss = run.enemies.spawn(120, 0, 0, BOSS_TYPES[0]);
    boss.x = 5;
    boss.z = 0;
    for (let t = 0; t < 10 && boss.hp > 0; t += 0.05) {
      run.update(0.05, STILL);
      run.pendingChoices = null;
    }
    expect(boss.hp).toBeLessThanOrEqual(0);
  });
});

describe('Run : vagues de boss', () => {
  /** Fait avancer la partie sans ennemis ordinaires qui gênent, avec un héros increvable. */
  const advance = (run: ReturnType<typeof makeRun>, seconds: number) => {
    run.player.stats.maxHp = 1e9;
    run.player.hp = 1e9;
    for (let t = 0; t < seconds; t += 0.05) {
      run.update(0.05, STILL);
      // Ne laisse pas la montée de niveau figer la simulation.
      run.pendingChoices = null;
    }
  };
  const bosses = (run: ReturnType<typeof makeRun>) => run.enemies.list.filter((e) => e.boss);

  it('n’envoie aucun boss avant la première échéance', () => {
    const run = makeRun();
    advance(run, BOSS_INTERVAL - 1);
    expect(bosses(run)).toHaveLength(0);
    expect(run.bossWave).toBe(0);
  });

  it('envoie un boss à 2 minutes et annonce la vague', () => {
    const waves: [number, number][] = [];
    const spawned: string[] = [];
    const run = makeRun({ onBossWave: (w, c) => waves.push([w, c]), onBossSpawn: (e) => spawned.push(e.type.id) });
    run.time = BOSS_INTERVAL - 0.1;
    advance(run, 0.5);
    expect(waves).toEqual([[1, 1]]);
    expect(bosses(run)).toHaveLength(1);
    expect(spawned).toHaveLength(1);
    expect(run.bossWave).toBe(1);
  });

  it('ajoute un boss à chaque vague, espacés dans le temps', () => {
    let spawns = 0;
    const run = makeRun({ onBossSpawn: () => spawns++ });
    run.time = BOSS_INTERVAL - 0.1;
    advance(run, 0.5);
    expect(spawns).toBe(1);
    // Vague 2 : deux boss, le premier tout de suite, le second BOSS_SPACING secondes plus tard.
    run.time = BOSS_INTERVAL * 2 - 0.1;
    advance(run, 0.5);
    expect(spawns).toBe(2);
    advance(run, BOSS_SPACING + 0.5);
    expect(spawns).toBe(3);
  });

  it('compte une vague par intervalle, et le nombre de boss annoncé augmente', () => {
    const waves: [number, number][] = [];
    const run = makeRun({ onBossWave: (w, c) => waves.push([w, c]) });
    for (let wave = 1; wave <= 6; wave++) {
      run.time = BOSS_INTERVAL * wave - 0.1;
      advance(run, 0.3);
    }
    expect(waves.map(([w]) => w)).toEqual([1, 2, 3, 4, 5, 6]);
    // 1, 2, 3, 4 puis plafonné à MAX_BOSSES.
    expect(waves.map(([, c]) => c)).toEqual([1, 2, 3, 4, MAX_BOSSES, MAX_BOSSES]);
  });

  it('ne dépasse jamais le plafond de boss simultanés, et reprend quand l’un meurt', () => {
    const run = makeRun();
    for (let wave = 1; wave <= 5; wave++) {
      run.time = BOSS_INTERVAL * wave - 0.1;
      advance(run, 0.3);
    }
    advance(run, BOSS_SPACING * 8);
    expect(bosses(run)).toHaveLength(MAX_BOSSES);
    const killed = bosses(run)[0];
    killed.hp = 0;
    advance(run, BOSS_SPACING + 1);
    expect(bosses(run).length).toBeLessThanOrEqual(MAX_BOSSES);
    expect(bosses(run)).not.toContain(killed);
  });

  it('alterne les types de boss', () => {
    const run = makeRun();
    run.time = BOSS_INTERVAL * 3 - 0.1;
    run.bossWave = 2;
    advance(run, 0.3);
    advance(run, BOSS_SPACING * 3);
    const ids = new Set(bosses(run).map((e) => e.type.id));
    expect(ids.size).toBeGreaterThanOrEqual(Math.min(2, BOSS_TYPES.length));
  });

  it('rend les boss plus forts avec le temps de partie', () => {
    const early = makeRun();
    early.time = BOSS_INTERVAL - 0.1;
    advance(early, 0.3);
    const late = makeRun();
    late.time = BOSS_INTERVAL * 5 - 0.1;
    late.bossWave = 4;
    advance(late, 0.3);
    expect(bosses(late)[0].maxHp).toBeGreaterThan(bosses(early)[0].maxHp * 2);
  });

  it('relaie les attaques des boss (onde de choc, salve) aux événements', () => {
    const events: string[] = [];
    const run = makeRun({ onBossSlam: () => events.push('slam'), onBossFire: () => events.push('fire') });
    run.player.stats.maxHp = run.player.hp = 1e9;
    run.enemies.onSlam?.(run.enemies.spawn(0, 0, 0, BOSS_TYPES[0]), 5);
    run.enemies.onFire?.(run.enemies.spawn(0, 0, 0, BOSS_TYPES[1]));
    expect(events).toEqual(['slam', 'fire']);
  });

  it('lâche une grosse gerbe de pièces et d’XP à sa mort, sans carte à choisir', () => {
    const killed: string[] = [];
    const run = makeRun({ onBossKilled: (e) => killed.push(e.type.id) });
    run.time = BOSS_INTERVAL - 0.1;
    advance(run, 0.3);
    const boss = bosses(run)[0];
    boss.hp = 0;
    const kills = run.kills;
    const before = run.pickups.count;
    run.update(0.05, STILL);
    expect(killed).toEqual([boss.type.id]);
    expect(run.kills).toBeGreaterThanOrEqual(kills + 1);
    expect(run.pickups.count - before).toBeGreaterThanOrEqual(BOSS_COINS + BOSS_GEMS - 2);
    expect(run.pendingChoices).toBeNull();
  });

  it('donne, une fois ramassé, beaucoup de pièces et plusieurs niveaux', () => {
    const run = makeRun();
    run.time = BOSS_INTERVAL - 0.1;
    advance(run, 0.3);
    bosses(run)[0].hp = 0;
    run.update(0.05, STILL);
    expect(bosses(run)).toHaveLength(0);
    // Un héros immobile ramasse tout le butin s'il est aimanté (aimant immense).
    run.player.stats.magnet = 200;
    for (let i = 0; i < 120; i++) {
      run.update(0.05, STILL);
      run.pendingChoices = null;
    }
    expect(run.gold).toBeGreaterThanOrEqual(BOSS_COINS * 3 - 1);
    expect(run.level).toBeGreaterThan(2);
  });

  it('repart de zéro avec reset()', () => {
    const run = makeRun();
    run.time = BOSS_INTERVAL * 3 - 0.1;
    advance(run, 0.5);
    expect(run.bossWave).toBeGreaterThan(0);
    run.reset();
    expect(run.bossWave).toBe(0);
    expect(bosses(run)).toHaveLength(0);
    advance(run, BOSS_INTERVAL - 1);
    expect(bosses(run)).toHaveLength(0);
    advance(run, 2);
    expect(run.bossWave).toBe(1);
  });

  it('applique la difficulté aux boss', () => {
    const run = makeRun();
    run.reset(baseStats(), { mods: { count: 1, hp: 2, damage: 1 } });
    run.time = BOSS_INTERVAL - 0.1;
    advance(run, 0.3);
    const normal = makeRun();
    normal.time = BOSS_INTERVAL - 0.1;
    advance(normal, 0.3);
    expect(bosses(run)[0].maxHp).toBeCloseTo(bosses(normal)[0].maxHp * 2, 0);
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

describe('Run : arme de départ et difficulté', () => {
  it('démarre avec la carabine par défaut', () => {
    const run = makeRun();
    expect(run.weapons.owned).toEqual(['rifle']);
    expect(run.upgradeLevels.get('weapon:rifle')).toBe(1);
  });

  it('démarre avec l’arme choisie, et seulement celle-là', () => {
    const run = makeRun();
    run.reset(baseStats(), { weapon: 'spear' });
    expect(run.weapons.owned).toEqual(['spear']);
    expect(run.upgradeLevels.get('weapon:spear')).toBe(1);
    placeEnemy(run.enemies, 6, 0);
    run.update(0.1, STILL);
    expect(run.weapons.shotCount).toBe(1);
  });

  it('ne propose en montée de niveau que les niveaux de l’arme choisie', () => {
    seedRandom(2);
    for (const weapon of WEAPONS) {
      const run = makeRun();
      run.reset(baseStats(), { weapon: weapon.id });
      const seen = new Set<string>();
      for (let i = 0; i < 60; i++) {
        run.xp = run.xpNeeded;
        run.update(0.016, STILL);
        for (const u of run.pendingChoices ?? []) {
          if (u.id.startsWith(WEAPON_PREFIX)) seen.add(u.id);
        }
        run.pendingChoices = null;
      }
      expect([...seen], weapon.id).toEqual([WEAPON_PREFIX + weapon.id]);
      expect(run.weapons.owned).toEqual([weapon.id]);
    }
  });

  it('fait monter l’arme choisie avec ses cartes, sans jamais en ajouter une autre', () => {
    seedRandom(4);
    const run = makeRun();
    run.reset(baseStats(), { weapon: 'aura' });
    for (let i = 0; i < 120; i++) {
      run.xp = run.xpNeeded;
      run.update(0.016, STILL);
      const card = run.pendingChoices?.find((u) => u.id === 'weapon:aura') ?? run.pendingChoices?.[0];
      if (card) run.choose(card);
    }
    expect(run.weapons.owned).toEqual(['aura']);
    expect(run.weapons.level('aura')).toBe(WEAPONS.find((w) => w.id === 'aura')!.levels.length);
    expect(run.upgradeLevels.get('weapon:aura')).toBe(run.weapons.level('aura'));
  });

  it('applique la difficulté aux ennemis', () => {
    const easy = makeRun();
    const hard = makeRun();
    easy.reset(baseStats(), { mods: { count: 1, hp: 0.5, damage: 0.5 } });
    hard.reset(baseStats(), { mods: { count: 1, hp: 2, damage: 2 } });
    const a = easy.enemies.spawn(0, 0, 0, enemyType('orc'));
    const b = hard.enemies.spawn(0, 0, 0, enemyType('orc'));
    expect(b.hp).toBeCloseTo(a.hp * 4);

    const damageAfter = (run: ReturnType<typeof makeRun>) => {
      const e = placeEnemy(run.enemies, 0.3, 0);
      e.hp = 1e9;
      for (let i = 0; i < 20; i++) run.enemies.update(0.01, 0, run.player);
      return run.player.stats.maxHp - run.player.hp;
    };
    expect(damageAfter(hard)).toBeCloseTo(damageAfter(easy) * 4, 0);
  });

  it('retrouve une difficulté normale après un reset sans réglage', () => {
    const run = makeRun();
    run.reset(baseStats(), { mods: { count: 3, hp: 3, damage: 3 } });
    run.reset();
    expect(run.enemies.mods).toEqual({ count: 1, hp: 1, damage: 1 });
  });

  it('fait apparaître plus d’ennemis en difficulté élevée', () => {
    const count = (mods: { count: number; hp: number; damage: number }) => {
      const run = makeRun();
      run.reset(baseStats(), { mods });
      run.player.stats.maxHp = run.player.hp = 1e9;
      for (let i = 0; i < 600; i++) run.enemies.update(0.02, 30, run.player);
      return run.enemies.list.length;
    };
    expect(count({ count: 2, hp: 1, damage: 1 })).toBeGreaterThan(count({ count: 1, hp: 1, damage: 1 }) * 1.5);
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
    // Seule l'arme de départ est possédée.
    expect([...run.upgradeLevels]).toEqual([['weapon:rifle', 1]]);
    expect(run.weapons.owned).toEqual(['rifle']);
    expect(run.player.hp).toBe(150);
    expect(run.player.x).toBe(0);
  });
});
