import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AMULETS, AMULET_MAX_LEVEL, amuletOf, applyAmulet } from '../src/amulets';
import {
  CHEST_BUNDLE,
  CHEST_ODDS,
  CHEST_PRICE,
  COIN_TIERS,
  applyReward,
  chestPrice,
  missingChestWeapons,
  missingCosmetics,
  openChests,
  rewardView,
  rollChest,
  rollCoins,
} from '../src/chests';
import { CATEGORIES, COSMETICS, DEFAULT_COSMETIC, cosmeticColor, cosmeticOf, defaultOwned, defaultStyle, lootableCosmetics } from '../src/cosmetics';
import {
  chooseWeapon,
  consumeAmulet,
  defaultSave,
  equipAmulet,
  exportSave,
  importSave,
  loadSave,
  persistSave,
  selectCosmetic,
  SAVE_KEY,
  startingStats,
} from '../src/meta';
import { baseStats } from '../src/player';
import { random, resetRandom, seedRandom } from '../src/rng';

beforeEach(() => seedRandom(77));
afterEach(() => resetRandom());

/** « Dés » prédéfinis, lus en boucle. */
const dice = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
};

describe('Apparences à collectionner', () => {
  it('ont des identifiants uniques par catégorie et une apparence de départ', () => {
    for (const category of CATEGORIES) {
      const ids = COSMETICS[category].map((c) => c.id);
      expect(new Set(ids).size, category).toBe(ids.length);
      expect(ids, category).toContain(DEFAULT_COSMETIC);
      expect(cosmeticColor(category, DEFAULT_COSMETIC), category).toBeNull();
      expect(COSMETICS[category].length, category).toBeGreaterThanOrEqual(4);
    }
  });

  it('proposent des couleurs valides, ou l’arc-en-ciel', () => {
    for (const category of CATEGORIES) {
      for (const c of COSMETICS[category]) {
        const ok = c.color === null || c.color === 'rainbow' || (Number.isInteger(c.color) && c.color >= 0 && c.color <= 0xffffff);
        expect(ok, `${category}/${c.id}`).toBe(true);
      }
    }
  });

  it('gardent l’apparence de départ hors des coffres', () => {
    const loot = lootableCosmetics();
    expect(loot.some((c) => c.id === DEFAULT_COSMETIC)).toBe(false);
    expect(loot.length).toBe(CATEGORIES.reduce((sum, cat) => sum + COSMETICS[cat].length - 1, 0));
    expect(cosmeticOf('projectile', 'inconnue')).toBeUndefined();
    expect(defaultOwned().trail).toEqual([DEFAULT_COSMETIC]);
    expect(defaultStyle().dust).toBe(DEFAULT_COSMETIC);
  });
});

describe('Amulettes', () => {
  it('ont des identifiants uniques, une icône et un nom', () => {
    expect(new Set(AMULETS.map((a) => a.id)).size).toBe(AMULETS.length);
    for (const a of AMULETS) {
      expect(a.icon.length, a.id).toBeGreaterThan(0);
      expect(a.name.length, a.id).toBeGreaterThan(0);
    }
  });

  it('ont chacune une icône dessinée : un SVG complet, avec ses propres dégradés', () => {
    const gradientIds = new Set<string>();
    for (const a of AMULETS) {
      expect(a.icon.startsWith('<svg'), a.id).toBe(true);
      expect(a.icon.trim().endsWith('</svg>'), a.id).toBe(true);
      expect(a.icon, a.id).toContain('viewBox');
      // Pas d'emoji : c'est bien un dessin.
      expect(/\p{Extended_Pictographic}/u.test(a.icon), a.id).toBe(false);
      for (const match of a.icon.matchAll(/id="([^"]+)"/g)) {
        // Deux icônes qui auraient le même identifiant de dégradé se mélangeraient à l'écran.
        expect(gradientIds.has(match[1]), `identifiant en double : ${match[1]}`).toBe(false);
        gradientIds.add(match[1]);
      }
    }
    // Chaque icône est différente des autres.
    expect(new Set(AMULETS.map((a) => a.icon)).size).toBe(AMULETS.length);
  });

  it('améliorent chacune une caractéristique, et davantage à chaque niveau', () => {
    for (const a of AMULETS) {
      const base = baseStats();
      const results = [1, 2, 3].map((level) => {
        const stats = { ...base };
        applyAmulet(stats, a.id, level);
        return stats;
      });
      const changed = (Object.keys(base) as (keyof typeof base)[]).filter((k) => results[0][k] !== base[k]);
      expect(changed.length, a.id).toBeGreaterThanOrEqual(1);
      for (const key of changed) {
        expect(Math.abs(results[1][key] - base[key]), `${a.id}/${key} niv 2`).toBeGreaterThan(Math.abs(results[0][key] - base[key]));
        expect(Math.abs(results[2][key] - base[key]), `${a.id}/${key} niv 3`).toBeGreaterThan(Math.abs(results[1][key] - base[key]));
      }
    }
  });

  it('borne le niveau entre 1 et le maximum, et ignore une amulette inconnue', () => {
    const at = (level: number) => {
      const stats = baseStats();
      applyAmulet(stats, 'stone', level);
      return stats.maxHp;
    };
    expect(at(0)).toBe(at(1));
    expect(at(99)).toBe(at(AMULET_MAX_LEVEL));
    const stats = baseStats();
    applyAmulet(stats, 'inconnue', 3);
    expect(stats).toEqual(baseStats());
    expect(amuletOf('inconnue')).toBeUndefined();
  });

  it('décrivent leur effet avec le niveau', () => {
    for (const a of AMULETS) expect(a.describe(1), a.id).not.toBe(a.describe(2));
  });
});

describe('Contenu des coffres', () => {
  it('a des prix et des probabilités cohérents', () => {
    expect(CHEST_PRICE).toBe(1000);
    expect(CHEST_BUNDLE).toEqual({ count: 3, price: 2500 });
    expect(CHEST_BUNDLE.price).toBeLessThan(CHEST_PRICE * CHEST_BUNDLE.count);
    expect(CHEST_ODDS.weapon).toBeCloseTo(0.01);
    expect(CHEST_ODDS.weapon + CHEST_ODDS.amulet + CHEST_ODDS.cosmetic).toBeLessThan(1);
    expect(chestPrice(1)).toBe(1000);
    expect(chestPrice(3)).toBe(2500);
    expect(chestPrice(2)).toBeNull();
    expect(chestPrice(0)).toBeNull();
  });

  it('donne l’arme exclusive avec environ 1 % de chances, tant qu’on ne l’a pas', () => {
    expect(rollChest(defaultSave(), dice(0.005, 0))).toEqual({ type: 'weapon', id: 'mines' });
    expect(missingChestWeapons(defaultSave())).toEqual(['mines']);
    const save = defaultSave();
    save.weapons.push('mines');
    expect(missingChestWeapons(save)).toEqual([]);
    // Déjà obtenue : le même tirage donne autre chose.
    expect(rollChest(save, dice(0.005, 0)).type).not.toBe('weapon');
  });

  it('donne une amulette, une apparence ou des pièces selon le tirage', () => {
    expect(rollChest(defaultSave(), dice(0.2, 0))).toEqual({ type: 'amulet', id: AMULETS[0].id });
    const cosmetic = rollChest(defaultSave(), dice(0.5, 0));
    expect(cosmetic).toMatchObject({ type: 'cosmetic' });
    expect(cosmetic).toEqual({ type: 'cosmetic', ...lootableCosmetics()[0] });
    expect(rollChest(defaultSave(), dice(0.95, 0.3, 0.5)).type).toBe('coins');
  });

  it('donne des pièces quand toutes les apparences sont déjà possédées', () => {
    const save = defaultSave();
    for (const c of lootableCosmetics()) save.cosmetics[c.category].push(c.id);
    expect(missingCosmetics(save)).toEqual([]);
    expect(rollChest(save, dice(0.5, 0.2, 0.2)).type).toBe('coins');
  });

  it('respecte les probabilités annoncées sur un grand nombre de coffres', () => {
    const n = 30000;
    const counts: Record<string, number> = { weapon: 0, amulet: 0, cosmetic: 0, coins: 0 };
    for (let i = 0; i < n; i++) counts[rollChest(defaultSave(), random).type]++;
    expect(counts.weapon / n).toBeGreaterThan(0.005);
    expect(counts.weapon / n).toBeLessThan(0.016);
    expect(counts.amulet / n).toBeGreaterThan(0.36);
    expect(counts.amulet / n).toBeLessThan(0.4);
    expect(counts.cosmetic / n).toBeGreaterThan(0.3);
    expect(counts.cosmetic / n).toBeLessThan(0.34);
    expect(counts.coins / n).toBeGreaterThan(0.27);
    expect(counts.coins / n).toBeLessThan(0.31);
  });

  it('tire des pièces entre 200 et 10 000, en multiples de 10, avec surtout de petits montants', () => {
    const amounts = Array.from({ length: 20000 }, () => rollCoins(random));
    for (const a of amounts) {
      expect(a).toBeGreaterThanOrEqual(COIN_TIERS[0].min);
      expect(a).toBeLessThanOrEqual(COIN_TIERS[COIN_TIERS.length - 1].max);
      expect(a % 10).toBe(0);
    }
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    // Les pièces des coffres ne font pas fortune : la moyenne reste bien sous le prix d'un coffre.
    expect(mean).toBeGreaterThan(400);
    expect(mean).toBeLessThan(CHEST_PRICE);
    expect(amounts.filter((a) => a <= 400).length / amounts.length).toBeGreaterThan(0.45);
    expect(Math.max(...amounts)).toBeGreaterThan(3000);
  });

  it('couvre toutes les tranches de pièces, des plus fréquentes aux plus rares', () => {
    expect(COIN_TIERS[0].min).toBe(200);
    expect(COIN_TIERS[COIN_TIERS.length - 1].max).toBe(10000);
    for (let i = 1; i < COIN_TIERS.length; i++) {
      expect(COIN_TIERS[i].min).toBe(COIN_TIERS[i - 1].max);
      expect(COIN_TIERS[i].weight).toBeLessThan(COIN_TIERS[i - 1].weight);
    }
  });
});

describe('Ouverture des coffres', () => {
  it('range chaque type de contenu dans la sauvegarde', () => {
    const save = defaultSave();
    applyReward(save, { type: 'weapon', id: 'mines' });
    applyReward(save, { type: 'weapon', id: 'mines' });
    expect(save.weapons.filter((w) => w === 'mines')).toHaveLength(1);
    applyReward(save, { type: 'amulet', id: 'sage' });
    applyReward(save, { type: 'amulet', id: 'sage' });
    expect(save.amulets.sage).toBe(2);
    applyReward(save, { type: 'cosmetic', category: 'dust', id: 'ash' });
    applyReward(save, { type: 'cosmetic', category: 'dust', id: 'ash' });
    expect(save.cosmetics.dust).toEqual([DEFAULT_COSMETIC, 'ash']);
    applyReward(save, { type: 'coins', amount: 250 });
    expect(save.gold).toBe(250);
  });

  it('débite 1000 pièces pour un coffre', () => {
    const save = defaultSave();
    save.gold = 1500;
    const rewards = openChests(save, 1, dice(0.95, 0.3, 0.5))!;
    expect(rewards).toHaveLength(1);
    expect(rewards[0].type).toBe('coins');
    expect(save.gold).toBe(500 + (rewards[0] as { amount: number }).amount);
  });

  it('débite 2500 pièces pour un lot de trois, et en tire trois', () => {
    const save = defaultSave();
    save.gold = 2500;
    const rewards = openChests(save, 3, dice(0.2, 0))!;
    expect(rewards).toHaveLength(3);
    expect(save.gold).toBe(0);
    expect(save.amulets.sage).toBe(3);
  });

  it('utilise les prix donnés à la place de ceux du jeu (mode dev)', () => {
    const save = defaultSave();
    save.gold = 5;
    expect(openChests(save, 1, dice(0.95, 0.3, 0.5), { single: 5, bundle: 9 })).toHaveLength(1);
    const again = defaultSave();
    again.gold = 8;
    expect(openChests(again, 3, random, { single: 5, bundle: 9 })).toBeNull();
    expect(again.gold).toBe(8);
  });

  it('refuse sans rien changer quand il manque des pièces ou que l’offre n’existe pas', () => {
    const save = defaultSave();
    save.gold = 999;
    expect(openChests(save, 1, random)).toBeNull();
    save.gold = 2499;
    expect(openChests(save, 3, random)).toBeNull();
    save.gold = 99999;
    expect(openChests(save, 2, random)).toBeNull();
    expect(openChests(save, 0, random)).toBeNull();
    expect(save.gold).toBe(99999);
    expect(save).toEqual({ ...defaultSave(), gold: 99999 });
  });

  it('ne donne jamais deux fois la même apparence ou la même arme exclusive', () => {
    const save = defaultSave();
    save.gold = 5_000_000;
    for (let i = 0; i < 600; i++) openChests(save, 3, random);
    expect(save.weapons.filter((w) => w === 'mines')).toHaveLength(1);
    for (const category of CATEGORIES) {
      expect(new Set(save.cosmetics[category]).size).toBe(save.cosmetics[category].length);
      // Après autant de coffres, toute la collection est complète.
      expect(save.cosmetics[category]).toHaveLength(COSMETICS[category].length);
    }
    expect(Object.values(save.amulets).reduce((a, b) => a + b, 0)).toBeGreaterThan(100);
  });

  it('est reproductible avec les mêmes dés', () => {
    const open = () => {
      const save = defaultSave();
      save.gold = 100000;
      seedRandom(5);
      openChests(save, 3, random);
      openChests(save, 1, random);
      return save;
    };
    expect(open()).toEqual(open());
  });
});

describe('Affichage du contenu', () => {
  it('annonce chaque contenu en gros sur la carte plein écran', () => {
    expect(rewardView({ type: 'weapon', id: 'mines' }).label).toBe('Nouvelle arme secrète !');
    expect(rewardView({ type: 'amulet', id: 'sage' }).label).toBe('Amulette');
    expect(rewardView({ type: 'cosmetic', category: 'dust', id: 'ash' }).label).toBe('Nouvelle apparence');
    expect(rewardView({ type: 'coins', amount: 300 }).label).toBe('Pièces');
    expect(rewardView({ type: 'coins', amount: 7000 }).label).toBe('Jackpot !');
  });

  it('donne le montant des pièces pour le faire défiler, et seulement pour elles', () => {
    expect(rewardView({ type: 'coins', amount: 450 }).amount).toBe(450);
    expect(rewardView({ type: 'weapon', id: 'mines' }).amount).toBeUndefined();
    expect(rewardView({ type: 'amulet', id: 'sage' }).amount).toBeUndefined();
  });

  it('a un libellé, un titre et un sous-titre pour tout ce que les coffres peuvent donner', () => {
    const rewards = [
      { type: 'weapon', id: 'mines' },
      ...AMULETS.map((a) => ({ type: 'amulet', id: a.id })),
      ...lootableCosmetics().map((c) => ({ type: 'cosmetic', category: c.category, id: c.id })),
      { type: 'coins', amount: 200 },
      { type: 'coins', amount: 10000 },
    ] as Parameters<typeof rewardView>[0][];
    for (const reward of rewards) {
      const view = rewardView(reward);
      expect(view.label.length, JSON.stringify(reward)).toBeGreaterThan(0);
      expect(view.title.length, JSON.stringify(reward)).toBeGreaterThan(0);
      expect(view.subtitle.length, JSON.stringify(reward)).toBeGreaterThan(0);
      expect(['common', 'rare', 'legendary']).toContain(view.tier);
    }
  });

  it('décrit chaque type de contenu', () => {
    expect(rewardView({ type: 'weapon', id: 'mines' })).toMatchObject({ title: 'Mines', tier: 'legendary' });
    expect(rewardView({ type: 'amulet', id: 'sage' })).toMatchObject({ title: 'Œil de sage', tier: 'rare' });
    expect(rewardView({ type: 'cosmetic', category: 'trail', id: 'flame' })).toMatchObject({ title: 'Flammes', tier: 'rare' });
    expect(rewardView({ type: 'cosmetic', category: 'trail', id: 'flame' }).subtitle).toContain('Traînées');
    expect(rewardView({ type: 'coins', amount: 300 })).toMatchObject({ title: '300 pièces', tier: 'common' });
    expect(rewardView({ type: 'coins', amount: 5000 }).tier).toBe('legendary');
  });
});

describe('Amulettes et apparences dans la sauvegarde', () => {
  const withStock = (id: string, count: number) => {
    const save = defaultSave();
    save.amulets[id] = count;
    return save;
  };

  it('démarre vide : aucune amulette, apparences de départ', () => {
    const save = defaultSave();
    expect(save.amulets).toEqual({});
    expect(save.amulet).toBe('');
    expect(save.style).toEqual(defaultStyle());
    expect(save.cosmetics).toEqual(defaultOwned());
  });

  it('équipe seulement une amulette en stock, avec un niveau borné par le stock et le maximum', () => {
    const save = withStock('sage', 2);
    expect(equipAmulet(save, 'stone', 1)).toBe(false);
    expect(equipAmulet(save, 'inconnue', 1)).toBe(false);
    expect(equipAmulet(save, 'sage', 3)).toBe(true);
    expect(save.amulet).toBe('sage');
    expect(save.amuletLevel).toBe(2);
    expect(equipAmulet(save, 'sage', 0)).toBe(true);
    expect(save.amuletLevel).toBe(1);
    expect(equipAmulet(save, '', 1)).toBe(true);
    expect(save.amulet).toBe('');
    save.amulets.sage = 9;
    equipAmulet(save, 'sage', 9);
    expect(save.amuletLevel).toBe(AMULET_MAX_LEVEL);
  });

  it('consomme autant d’exemplaires que le niveau et se déséquipe, même s’il en reste', () => {
    const save = withStock('stone', 5);
    equipAmulet(save, 'stone', 3);
    expect(consumeAmulet(save)).toEqual({ id: 'stone', level: 3 });
    expect(save.amulets.stone).toBe(2);
    // Il en reste, mais elle n'est plus équipée : pour la partie suivante, il faut la rééquiper.
    expect(save.amulet).toBe('');
    expect(save.amuletLevel).toBe(1);
    expect(consumeAmulet(save)).toBeNull();
    expect(save.amulets.stone).toBe(2);
    // Rééquipée avec un niveau trop haut : il est ramené au stock, qui se vide.
    equipAmulet(save, 'stone', 3);
    expect(consumeAmulet(save)).toEqual({ id: 'stone', level: 2 });
    expect(save.amulets.stone).toBeUndefined();
    expect(save.amulet).toBe('');
    expect(consumeAmulet(save)).toBeNull();
  });

  it('garde l’amulette déséquipée après rechargement de la sauvegarde', () => {
    const storage = { data: {} as Record<string, string>, getItem(k: string) { return this.data[k] ?? null; }, setItem(k: string, v: string) { this.data[k] = v; } };
    const save = withStock('stone', 4);
    equipAmulet(save, 'stone', 1);
    consumeAmulet(save);
    persistSave(storage, save);
    const loaded = loadSave(storage);
    expect(loaded.amulets.stone).toBe(3);
    expect(loaded.amulet).toBe('');
  });

  it('ne consomme rien quand aucune amulette n’est équipée, ou quand l’équipée n’existe plus', () => {
    const save = withStock('stone', 2);
    expect(consumeAmulet(save)).toBeNull();
    expect(save.amulets.stone).toBe(2);
    save.amulet = 'stone';
    save.amulets.stone = 0;
    expect(consumeAmulet(save)).toBeNull();
    expect(save.amulet).toBe('');
  });

  it('applique l’amulette aux caractéristiques de départ, sans toucher la boutique', () => {
    const save = defaultSave();
    save.shop = { vitality: 2 };
    const without = startingStats(save);
    const wearing = startingStats(save, { id: 'stone', level: 2 });
    expect(wearing.maxHp).toBe(without.maxHp + 60);
    expect(startingStats(save, null)).toEqual(without);
    expect(startingStats(defaultSave())).toEqual(baseStats());
  });

  it('choisit seulement une apparence possédée', () => {
    const save = defaultSave();
    expect(selectCosmetic(save, 'projectile', 'crimson')).toBe(false);
    expect(save.style.projectile).toBe(DEFAULT_COSMETIC);
    applyReward(save, { type: 'cosmetic', category: 'projectile', id: 'crimson' });
    expect(selectCosmetic(save, 'projectile', 'crimson')).toBe(true);
    expect(save.style.projectile).toBe('crimson');
    expect(selectCosmetic(save, 'projectile', DEFAULT_COSMETIC)).toBe(true);
    expect(selectCosmetic(save, 'projectile', 'inconnue')).toBe(false);
  });

  it('ne permet pas d’acheter l’arme de coffre, mais de la choisir une fois trouvée', () => {
    const save = defaultSave();
    save.gold = 1_000_000;
    expect(chooseWeapon(save, 'mines')).toBe('denied');
    expect(save.gold).toBe(1_000_000);
    expect(save.weapons).not.toContain('mines');
    applyReward(save, { type: 'weapon', id: 'mines' });
    expect(chooseWeapon(save, 'mines')).toBe('selected');
    expect(save.weapon).toBe('mines');
  });

  it('se conserve, se relit et passe par l’export/import', () => {
    const save = defaultSave();
    save.amulets = { sage: 3, fang: 1 };
    save.amulet = 'sage';
    save.amuletLevel = 2;
    applyReward(save, { type: 'cosmetic', category: 'dust', id: 'leaves' });
    applyReward(save, { type: 'cosmetic', category: 'trail', id: 'ice' });
    selectCosmetic(save, 'dust', 'leaves');
    selectCosmetic(save, 'trail', 'ice');
    applyReward(save, { type: 'weapon', id: 'mines' });
    const storage = memoryStorage();
    persistSave(storage, save);
    expect(loadSave(storage)).toEqual(save);
    expect(importSave(exportSave(save))).toEqual(save);
  });

  it('nettoie les valeurs invalides à la lecture', () => {
    const raw = JSON.stringify({
      amulets: { sage: 5.9, stone: -2, fang: 'beaucoup', bazooka: 4, whirl: 100000 },
      amulet: 'stone',
      amuletLevel: 99,
      cosmetics: { projectile: ['crimson', 'inconnu', 'crimson'], dust: 'ash', trail: ['flame'] },
      style: { projectile: 'cyan', trail: 'flame', dust: 'ash' },
    });
    const save = loadSave(memoryStorage({ [SAVE_KEY]: raw }));
    expect(save.amulets).toEqual({ sage: 5, whirl: 999 });
    // « stone » n'est pas en stock : rien d'équipé.
    expect(save.amulet).toBe('');
    expect(save.amuletLevel).toBe(AMULET_MAX_LEVEL);
    expect(save.cosmetics.projectile).toEqual([DEFAULT_COSMETIC, 'crimson']);
    expect(save.cosmetics.dust).toEqual([DEFAULT_COSMETIC]);
    // Les apparences choisies doivent être possédées : sinon, retour à l'apparence de départ.
    expect(save.style).toEqual({ projectile: DEFAULT_COSMETIC, trail: 'flame', dust: DEFAULT_COSMETIC });
  });

  it('reste lisible pour une ancienne sauvegarde sans coffres', () => {
    const save = loadSave(memoryStorage({ [SAVE_KEY]: JSON.stringify({ gold: 40, weapon: 'rifle' }) }));
    expect(save.gold).toBe(40);
    expect(save.amulets).toEqual({});
    expect(save.cosmetics).toEqual(defaultOwned());
    expect(save.style).toEqual(defaultStyle());
  });
});
