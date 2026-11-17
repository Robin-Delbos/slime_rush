import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEV_CHEST_PRICES,
  DEV_KEY,
  DEV_LIMITS,
  DEV_PRESETS,
  defaultDevSettings,
  devChestPrices,
  devRunSetup,
  devSummary,
  loadDevSettings,
  persistDevSettings,
  sanitizeDevSettings,
} from '../src/dev';
import { CHEST_PRICES, chestPrice, openChests } from '../src/chests';
import { defaultSave } from '../src/meta';
import { BOSS_INTERVAL } from '../src/run';
import { baseStats } from '../src/player';
import { resetRandom, seedRandom } from '../src/rng';
import { PASSIVES, WEAPON_PREFIX } from '../src/upgrades';
import { WEAPONS } from '../src/weaponData';
import { STILL, makeRun } from './helpers';

beforeEach(() => seedRandom(21));
afterEach(() => resetRandom());

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
};

describe('Mode dev : réglages', () => {
  it('est inactif par défaut, au niveau 1 et à 0 minute', () => {
    expect(defaultDevSettings()).toEqual({ enabled: false, level: 1, minutes: 0, upgrades: true, cheapChests: false });
    expect(devRunSetup(defaultDevSettings())).toBeNull();
  });

  it('transmet le niveau, le temps en secondes et le choix des améliorations quand il est actif', () => {
    expect(devRunSetup({ enabled: true, level: 42, minutes: 7.5, upgrades: false, cheapChests: false })).toEqual({
      startLevel: 42,
      startTime: 450,
      autoUpgrades: false,
    });
  });

  it('ramène les valeurs hors limites dans les bornes, et arrondit', () => {
    const s = sanitizeDevSettings({ enabled: true, level: 9999, minutes: -5 });
    expect(s.level).toBe(DEV_LIMITS.level.max);
    expect(s.minutes).toBe(DEV_LIMITS.minutes.min);
    expect(sanitizeDevSettings({ level: -3 }).level).toBe(DEV_LIMITS.level.min);
    expect(sanitizeDevSettings({ minutes: 500 }).minutes).toBe(DEV_LIMITS.minutes.max);
    expect(sanitizeDevSettings({ level: 12.9 }).level).toBe(12);
    expect(sanitizeDevSettings({ minutes: 2.6 }).minutes).toBe(2.5);
  });

  it('accepte du texte numérique (champs de saisie) et ignore le reste', () => {
    expect(sanitizeDevSettings({ level: '37', minutes: '4.5' })).toMatchObject({ level: 37, minutes: 4.5 });
    const fallback = defaultDevSettings();
    for (const raw of [null, undefined, 'x', 42, [], { level: 'abc', minutes: '', enabled: 'oui', upgrades: 1 }]) {
      expect(sanitizeDevSettings(raw), JSON.stringify(raw)).toEqual(fallback);
    }
  });

  it('se conserve dans le stockage, sous sa propre clé (pas dans la sauvegarde du jeu)', () => {
    const storage = memoryStorage();
    persistDevSettings(storage, { enabled: true, level: 60, minutes: 8, upgrades: false, cheapChests: false });
    expect(DEV_KEY).not.toBe('slime-rush.save');
    expect(Object.keys(storage.data)).toEqual([DEV_KEY]);
    expect(loadDevSettings(storage)).toEqual({ enabled: true, level: 60, minutes: 8, upgrades: false, cheapChests: false });
  });

  it('survit à un stockage absent, vide ou corrompu', () => {
    expect(loadDevSettings(null)).toEqual(defaultDevSettings());
    expect(loadDevSettings(memoryStorage())).toEqual(defaultDevSettings());
    expect(loadDevSettings(memoryStorage({ [DEV_KEY]: '{pas du json' }))).toEqual(defaultDevSettings());
    expect(() => persistDevSettings({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, defaultDevSettings())).not.toThrow();
  });

  it('résume les réglages sur le bouton', () => {
    expect(devSummary(defaultDevSettings())).toBe('🛠 Dev');
    expect(devSummary({ enabled: true, level: 50, minutes: 8, upgrades: true, cheapChests: false })).toBe('🛠 Niv 50 · 08:00');
    expect(devSummary({ enabled: true, level: 5, minutes: 1.5, upgrades: true, cheapChests: false })).toBe('🛠 Niv 5 · 01:30');
  });

  it('propose des préréglages valides', () => {
    expect(DEV_PRESETS.length).toBeGreaterThan(0);
    for (const p of DEV_PRESETS) expect(sanitizeDevSettings({ level: p.level, minutes: p.minutes }), p.label).toMatchObject({ level: p.level, minutes: p.minutes });
  });
});

describe('Mode dev : coffres à 1 pièce', () => {
  const rng = () => 0.95;

  it('est désactivé par défaut : les prix du jeu restent ceux du jeu', () => {
    expect(defaultDevSettings().cheapChests).toBe(false);
    expect(devChestPrices(defaultDevSettings())).toBeNull();
    expect(CHEST_PRICES).toEqual({ single: 1000, bundle: 2500 });
  });

  it('ramène le coffre à 1 pièce et le lot de trois à 2 pièces', () => {
    expect(DEV_CHEST_PRICES).toEqual({ single: 1, bundle: 2 });
    expect(devChestPrices({ ...defaultDevSettings(), cheapChests: true })).toEqual(DEV_CHEST_PRICES);
    expect(chestPrice(1, DEV_CHEST_PRICES)).toBe(1);
    expect(chestPrice(3, DEV_CHEST_PRICES)).toBe(2);
    expect(chestPrice(2, DEV_CHEST_PRICES)).toBeNull();
    expect(chestPrice(1)).toBe(1000);
  });

  it('est indépendant du niveau et du temps de départ', () => {
    const settings = { ...defaultDevSettings(), cheapChests: true };
    expect(devRunSetup(settings)).toBeNull();
    expect(devChestPrices(settings)).not.toBeNull();
    const other = { ...defaultDevSettings(), enabled: true, level: 50, minutes: 5 };
    expect(devChestPrices(other)).toBeNull();
  });

  it('permet d’ouvrir un coffre pour 1 pièce et trois pour 2', () => {
    const one = defaultSave();
    one.gold = 1;
    expect(openChests(one, 1, rng, DEV_CHEST_PRICES)).toHaveLength(1);
    expect(one.gold).toBeGreaterThanOrEqual(0);
    const three = defaultSave();
    three.gold = 2;
    expect(openChests(three, 3, rng, DEV_CHEST_PRICES)).toHaveLength(3);
    // Avec les prix normaux, ces mêmes pièces ne suffisent pas.
    const poor = defaultSave();
    poor.gold = 2;
    expect(openChests(poor, 1, rng)).toBeNull();
    expect(openChests(poor, 3, rng)).toBeNull();
    expect(poor.gold).toBe(2);
  });

  it('refuse quand il manque même cette pièce', () => {
    const save = defaultSave();
    save.gold = 0;
    expect(openChests(save, 1, rng, DEV_CHEST_PRICES)).toBeNull();
    save.gold = 1;
    expect(openChests(save, 3, rng, DEV_CHEST_PRICES)).toBeNull();
  });

  it('se conserve dans les réglages et se relit', () => {
    const storage = memoryStorage();
    persistDevSettings(storage, { ...defaultDevSettings(), cheapChests: true });
    expect(loadDevSettings(storage).cheapChests).toBe(true);
    expect(sanitizeDevSettings({ cheapChests: 'oui' }).cheapChests).toBe(false);
    expect(sanitizeDevSettings({ cheapChests: true }).cheapChests).toBe(true);
  });

  it('se voit sur le bouton du panneau', () => {
    expect(devSummary({ ...defaultDevSettings(), cheapChests: true })).toContain('coffres');
  });
});

describe('Mode dev : départ de partie', () => {
  const upgradesTaken = (run: ReturnType<typeof makeRun>) => [...run.upgradeLevels.values()].reduce((a, b) => a + b, 0);

  it('démarre au niveau et au temps demandés, avec toute la vie et sans XP', () => {
    const run = makeRun();
    run.player.hp = 3;
    run.reset(baseStats(), { startLevel: 30, startTime: 600 });
    expect(run.level).toBe(30);
    expect(run.time).toBe(600);
    expect(run.xp).toBe(0);
    expect(run.player.hp).toBe(run.player.stats.maxHp);
    expect(run.startLevel).toBe(30);
    expect(run.startTime).toBe(600);
    expect(run.xpNeeded).toBeGreaterThan(xpFor(29));
  });

  const xpFor = (level: number) => Math.round(4 + level * 3.5);

  it('donne autant d’améliorations que de niveaux gagnés, quand on le demande', () => {
    const run = makeRun();
    run.reset(baseStats(), { startLevel: 12, autoUpgrades: true });
    // L'arme de départ compte pour 1 niveau d'arme ; chacune des 11 autres améliorations ajoute 1.
    expect(upgradesTaken(run)).toBe(1 + 11);
    run.reset(baseStats(), { startLevel: 12, autoUpgrades: false });
    expect(upgradesTaken(run)).toBe(1);
  });

  it('ne dépasse jamais les maximums d’améliorations, même à un niveau très élevé', () => {
    const run = makeRun();
    run.reset(baseStats(), { startLevel: 150, autoUpgrades: true });
    expect(run.level).toBe(150);
    for (const u of PASSIVES) expect(run.upgradeLevels.get(u.id) ?? 0, u.id).toBeLessThanOrEqual(u.max);
    for (const w of WEAPONS) expect(run.upgradeLevels.get(WEAPON_PREFIX + w.id) ?? 0, w.id).toBeLessThanOrEqual(w.levels.length);
    // Il n'y a qu'une arme : toutes les améliorations possibles sont prises, et la partie démarre quand même.
    run.update(0.016, STILL);
    expect(run.over).toBe(false);
  });

  it('applique les améliorations au héros (PV max, vitesse…)', () => {
    const base = makeRun();
    const run = makeRun();
    run.reset(baseStats(), { startLevel: 60, autoUpgrades: true });
    const stats = run.player.stats;
    const reference = baseStats();
    const changed = (Object.keys(reference) as (keyof typeof reference)[]).some((key) => stats[key] !== reference[key]);
    expect(changed).toBe(true);
    expect(run.player.hp).toBe(stats.maxHp);
    expect(base.player.stats.maxHp).toBe(reference.maxHp);
  });

  it('ne déclenche pas d’un coup toutes les vagues de boss déjà passées', () => {
    const waves: number[] = [];
    const run = makeRun({ onBossWave: (w) => waves.push(w) });
    run.reset(baseStats(), { startTime: BOSS_INTERVAL * 4 + 30 });
    expect(run.bossWave).toBe(4);
    run.player.stats.maxHp = run.player.hp = 1e9;
    for (let i = 0; i < 40; i++) run.update(0.05, STILL);
    expect(waves).toEqual([]);
    // La suivante arrive à l'échéance d'après, comme dans une vraie partie.
    run.time = BOSS_INTERVAL * 5 - 0.1;
    run.update(0.5, STILL);
    expect(waves).toEqual([5]);
  });

  it('fait bien apparaître des ennemis plus forts quand le temps de départ est élevé', () => {
    const early = makeRun();
    const late = makeRun();
    late.reset(baseStats(), { startTime: 600 });
    const a = early.enemies.spawn(early.time, 0, 0);
    const b = late.enemies.spawn(late.time, 0, 0);
    expect(b.maxHp / b.type.hp).toBeGreaterThan(a.maxHp / a.type.hp);
  });

  it('compte le temps joué sans le temps de départ, et signale un départ personnalisé', () => {
    const run = makeRun();
    expect(run.customStart).toBe(false);
    run.reset(baseStats(), { startTime: 300 });
    expect(run.customStart).toBe(true);
    expect(run.survived).toBe(0);
    run.player.stats.maxHp = run.player.hp = 1e9;
    for (let i = 0; i < 20; i++) run.update(0.1, STILL);
    expect(run.survived).toBeCloseTo(2, 1);
    expect(run.time).toBeCloseTo(302, 1);
    run.reset(baseStats(), { startLevel: 5 });
    expect(run.customStart).toBe(true);
    run.reset();
    expect(run.customStart).toBe(false);
    expect(run.survived).toBe(0);
  });

  it('une partie normale reste inchangée : niveau 1, temps 0', () => {
    const run = makeRun();
    expect(run.level).toBe(1);
    expect(run.time).toBe(0);
    expect(run.bossWave).toBe(0);
  });

  it('ignore les valeurs absurdes (négatives, décimales)', () => {
    const run = makeRun();
    run.reset(baseStats(), { startLevel: -4, startTime: -50 });
    expect(run.level).toBe(1);
    expect(run.time).toBe(0);
    run.reset(baseStats(), { startLevel: 7.9 });
    expect(run.level).toBe(7);
  });

  it('permet de tester le niveau 100 : partir du niveau 99 déclenche la Légende au premier niveau gagné', () => {
    let legends = 0;
    const run = makeRun({ onLegend: () => legends++ });
    run.reset(baseStats(), { startLevel: 99, autoUpgrades: true });
    run.player.stats.maxHp = run.player.hp = 1e9;
    run.xp = run.xpNeeded;
    run.update(0.016, STILL);
    expect(run.level).toBe(100);
    expect(legends).toBe(1);
  });
});
