import { describe, expect, it } from 'vitest';
import {
  CHARACTERS,
  DIFFICULTIES,
  SAVE_KEY,
  SHOP_ITEMS,
  addLegend,
  buyShopItem,
  chooseCharacter,
  chooseDifficulty,
  chooseWeapon,
  defaultSave,
  exportSave,
  hasLegend,
  importSave,
  loadSave,
  persistSave,
  SHOP_GROWTH,
  runReward,
  selectedDifficulty,
  selectedWeapon,
  shopCost,
  startingStats,
  type StorageLike,
} from '../src/meta';
import { CHEST_PRICE } from '../src/chests';
import { baseStats } from '../src/player';
import { WEAPONS } from '../src/weaponData';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe('Sauvegarde', () => {
  it('donne une sauvegarde neuve sans stockage ou sans données', () => {
    expect(loadSave(null)).toEqual(defaultSave());
    expect(loadSave(memoryStorage())).toEqual(defaultSave());
  });

  it('relit ce qui a été enregistré', () => {
    const storage = memoryStorage();
    const save = defaultSave();
    save.gold = 321;
    save.bestTime = 95;
    save.shop = { vitality: 3 };
    save.unlocked = ['ombre', 'bolt'];
    save.selected = 'bolt';
    save.weapons = ['rifle', 'aura'];
    save.weapon = 'aura';
    save.difficulty = 'hard';
    save.muted = true;
    persistSave(storage, save);
    expect(loadSave(storage)).toEqual(save);
  });

  it('survit à une sauvegarde corrompue', () => {
    expect(loadSave(memoryStorage({ [SAVE_KEY]: '{pas du json' }))).toEqual(defaultSave());
    expect(loadSave(memoryStorage({ [SAVE_KEY]: 'null' }))).toEqual(defaultSave());
  });

  it('nettoie les valeurs invalides', () => {
    const raw = JSON.stringify({
      gold: -50,
      bestTime: 'abc',
      shop: { vitality: 999, inconnu: 4, power: -2 },
      unlocked: ['bolt', 'pirate'],
      selected: 'pip',
    });
    const save = loadSave(memoryStorage({ [SAVE_KEY]: raw }));
    expect(save.gold).toBe(0);
    expect(save.bestTime).toBe(0);
    expect(save.shop).toEqual({ vitality: SHOP_ITEMS.find((i) => i.id === 'vitality')!.max });
    expect(save.unlocked).toEqual(['ombre', 'bolt']);
    // 'pip' n'est pas débloqué : on garde le personnage par défaut.
    expect(save.selected).toBe('ombre');
  });

  it('nettoie les armes et la difficulté invalides', () => {
    const raw = JSON.stringify({ weapons: ['aura', 'bazooka'], weapon: 'spear', difficulty: 'impossible' });
    const save = loadSave(memoryStorage({ [SAVE_KEY]: raw }));
    expect(save.weapons).toEqual(['rifle', 'aura']);
    // La lance n'est pas débloquée : arme et difficulté par défaut.
    expect(save.weapon).toBe('rifle');
    expect(save.difficulty).toBe('normal');
    expect(loadSave(memoryStorage({ [SAVE_KEY]: JSON.stringify({ weapons: ['orbs'], weapon: 'orbs', difficulty: 'hard' }) }))).toMatchObject({ weapon: 'orbs', difficulty: 'hard' });
  });

  it('ne plante pas si le stockage refuse l’écriture', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => persistSave(storage, defaultSave())).not.toThrow();
  });
});

describe('Export et import de la sauvegarde', () => {
  function richSave() {
    const save = defaultSave();
    save.gold = 321;
    save.bestTime = 95;
    save.shop = { vitality: 3, greed: 1 };
    save.unlocked = ['ombre', 'bolt'];
    save.selected = 'bolt';
    save.weapons = ['rifle', 'spear'];
    save.weapon = 'spear';
    save.difficulty = 'extreme';
    save.legend = { spear: ['hard', 'extreme'] };
    return save;
  }

  it('restitue à l’import exactement ce qui a été exporté', () => {
    const save = richSave();
    expect(importSave(exportSave(save))).toEqual(save);
    expect(importSave(exportSave(defaultSave()))).toEqual(defaultSave());
  });

  it('produit un code d’une seule ligne, sans espace', () => {
    expect(exportSave(richSave())).toMatch(/^SLIMERUSH1:[A-Za-z0-9+/=]+$/);
  });

  it('tolère les espaces et retours à la ligne ajoutés par un copier-coller', () => {
    const save = richSave();
    const code = exportSave(save);
    const mangled = `  ${code.slice(0, 20)}\n${code.slice(20, 45)} ${code.slice(45)}\r\n`;
    expect(importSave(mangled)).toEqual(save);
  });

  it('refuse tout ce qui n’est pas un code de sauvegarde', () => {
    const code = exportSave(richSave());
    expect(importSave('')).toBeNull();
    expect(importSave('bonjour')).toBeNull();
    expect(importSave(JSON.stringify(richSave()))).toBeNull();
    // Sans l'en-tête, code tronqué, contenu qui n'est pas un objet.
    expect(importSave(code.slice('SLIMERUSH1:'.length))).toBeNull();
    expect(importSave(code.slice(0, 30))).toBeNull();
    expect(importSave('SLIMERUSH1:!!!')).toBeNull();
    expect(importSave(`SLIMERUSH1:${btoa('null')}`)).toBeNull();
    expect(importSave(`SLIMERUSH1:${btoa('[1,2]')}`)).toBeNull();
    expect(importSave(`SLIMERUSH1:${btoa('42')}`)).toBeNull();
  });

  it('nettoie un code modifié à la main', () => {
    const forged = `SLIMERUSH1:${btoa(JSON.stringify({ gold: -5, shop: { vitality: 999 }, unlocked: ['pirate'], selected: 'pip' }))}`;
    const save = importSave(forged)!;
    expect(save.gold).toBe(0);
    expect(save.shop.vitality).toBe(SHOP_ITEMS.find((i) => i.id === 'vitality')!.max);
    expect(save.unlocked).toEqual(['ombre']);
    expect(save.selected).toBe('ombre');
  });

  it('ne modifie pas la sauvegarde exportée et renvoie une copie indépendante', () => {
    const save = richSave();
    const copy = importSave(exportSave(save))!;
    copy.shop.vitality = 9;
    copy.unlocked.push('pip');
    expect(save).toEqual(richSave());
  });
});

describe('Badge du niveau 100', () => {
  it('est vide au départ et conservé dans la sauvegarde', () => {
    expect(defaultSave().legend).toEqual({});
    const storage = memoryStorage();
    const save = defaultSave();
    save.legend = { rifle: ['normal'], aura: ['easy', 'extreme'] };
    persistSave(storage, save);
    expect(loadSave(storage).legend).toEqual({ rifle: ['normal'], aura: ['easy', 'extreme'] });
  });

  it('est propre à chaque arme ET à chaque difficulté', () => {
    const save = defaultSave();
    expect(hasLegend(save, 'rifle', 'normal')).toBe(false);
    expect(addLegend(save, 'rifle', 'normal')).toBe(true);
    expect(hasLegend(save, 'rifle', 'normal')).toBe(true);
    // Une autre difficulté, ou une autre arme, n'a pas le badge.
    expect(hasLegend(save, 'rifle', 'hard')).toBe(false);
    expect(hasLegend(save, 'rifle', 'easy')).toBe(false);
    expect(hasLegend(save, 'aura', 'normal')).toBe(false);
  });

  it('suit la difficulté choisie quand on ne la précise pas', () => {
    const save = defaultSave();
    addLegend(save, 'rifle', 'hard');
    save.weapon = 'rifle';
    save.difficulty = 'easy';
    expect(hasLegend(save, 'rifle')).toBe(false);
    save.difficulty = 'hard';
    expect(hasLegend(save, 'rifle')).toBe(true);
  });

  it('cumule plusieurs difficultés pour une même arme, dans l’ordre, sans doublon', () => {
    const save = defaultSave();
    expect(addLegend(save, 'rifle', 'extreme')).toBe(true);
    expect(addLegend(save, 'rifle', 'easy')).toBe(true);
    expect(addLegend(save, 'rifle', 'easy')).toBe(false);
    expect(save.legend.rifle).toEqual(['easy', 'extreme']);
  });

  it('refuse une arme ou une difficulté inconnue', () => {
    const save = defaultSave();
    expect(addLegend(save, 'bazooka', 'normal')).toBe(false);
    expect(addLegend(save, 'rifle', 'impossible')).toBe(false);
    expect(save.legend).toEqual({});
  });

  it('ignore les armes et difficultés inconnues et les doublons à la lecture', () => {
    const raw = JSON.stringify({ legend: { aura: ['hard', 'easy', 'hard', 'impossible'], bazooka: ['easy'], rifle: 'normal', spear: [] } });
    expect(loadSave(memoryStorage({ [SAVE_KEY]: raw })).legend).toEqual({ aura: ['easy', 'hard'] });
  });

  it('ignore l’ancien format (liste d’armes) et les valeurs invalides', () => {
    for (const legend of [['rifle'], 'rifle', 42, null]) {
      expect(loadSave(memoryStorage({ [SAVE_KEY]: JSON.stringify({ legend }) })).legend, JSON.stringify(legend)).toEqual({});
    }
  });

  it('reste lisible pour une ancienne sauvegarde qui n’en avait pas', () => {
    const raw = JSON.stringify({ gold: 12, weapon: 'rifle' });
    const save = loadSave(memoryStorage({ [SAVE_KEY]: raw }));
    expect(save.legend).toEqual({});
    expect(save.gold).toBe(12);
  });

  it('survit à un export puis un import', () => {
    const save = defaultSave();
    addLegend(save, 'spear', 'hard');
    addLegend(save, 'spear', 'extreme');
    expect(importSave(exportSave(save))!.legend).toEqual({ spear: ['hard', 'extreme'] });
  });
});

describe('Boutique', () => {
  it('augmente le prix à chaque niveau', () => {
    for (const item of SHOP_ITEMS) {
      for (let level = 0; level < item.max - 1; level++) {
        expect(shopCost(item, level + 1)).toBeGreaterThan(shopCost(item, level));
      }
    }
  });

  it('achète un niveau et débite l’or', () => {
    const save = defaultSave();
    const item = SHOP_ITEMS[0];
    save.gold = shopCost(item, 0) + 7;
    expect(buyShopItem(save, item.id)).toBe(true);
    expect(save.gold).toBe(7);
    expect(save.shop[item.id]).toBe(1);
  });

  it('refuse l’achat sans assez d’or, au niveau maximum, ou pour un objet inconnu', () => {
    const save = defaultSave();
    const item = SHOP_ITEMS[0];
    save.gold = shopCost(item, 0) - 1;
    expect(buyShopItem(save, item.id)).toBe(false);
    expect(save.shop[item.id]).toBeUndefined();

    save.gold = 1e9;
    save.shop[item.id] = item.max;
    expect(buyShopItem(save, item.id)).toBe(false);
    expect(buyShopItem(save, 'inconnu')).toBe(false);
    expect(save.gold).toBe(1e9);
  });

  it('applique chaque amélioration achetée aux caractéristiques de départ', () => {
    const base = baseStats();
    for (const item of SHOP_ITEMS) {
      const save = defaultSave();
      save.shop[item.id] = 2;
      expect(startingStats(save), item.id).not.toEqual(base);
    }
    const save = defaultSave();
    save.shop = { vitality: 3, haste: 2 };
    const stats = startingStats(save);
    expect(stats.maxHp).toBe(base.maxHp + 30);
    expect(stats.cooldown).toBeLessThan(base.cooldown);
  });
});

describe('Équilibre des prix', () => {
  // Repères du joueur : un débutant gagne environ 1 000 pièces par partie, un bon joueur environ 10 000.
  const BEGINNER = 1000;
  const GOOD = 10000;
  const item = (id: string) => SHOP_ITEMS.find((i) => i.id === id)!;
  const totalCost = (it: (typeof SHOP_ITEMS)[number]) => Array.from({ length: it.max }, (_, level) => shopCost(it, level)).reduce((a, b) => a + b, 0);
  const shopTotal = SHOP_ITEMS.reduce((sum, it) => sum + totalCost(it), 0);

  it('garde les mêmes prix pour le premier niveau de chaque amélioration', () => {
    const first = Object.fromEntries(SHOP_ITEMS.map((i) => [i.id, shopCost(i, 0)]));
    expect(first).toEqual({ vitality: 20, power: 25, haste: 25, swift: 30, magnet: 20, greed: 40, wisdom: 40 });
  });

  it('monte plus vite pour Vitalité et Puissance (×1,8 par niveau) que pour les autres (×1,6)', () => {
    expect(SHOP_GROWTH).toBe(1.6);
    expect(item('vitality').growth).toBe(1.8);
    expect(item('power').growth).toBe(1.8);
    for (const id of ['haste', 'swift', 'magnet', 'greed', 'wisdom']) expect(item(id).growth, id).toBeUndefined();
    expect(shopCost(item('vitality'), 9)).toBe(3965);
    expect(shopCost(item('power'), 9)).toBe(4960);
    expect(shopCost(item('magnet'), 4)).toBe(130);
  });

  it('coûte environ 24 000 pièces au total : quelques parties d’un bon joueur, une vingtaine d’un débutant', () => {
    expect(shopTotal).toBeGreaterThan(23000);
    expect(shopTotal).toBeLessThan(25000);
    expect(shopTotal / GOOD).toBeGreaterThan(2);
    expect(shopTotal / GOOD).toBeLessThan(3);
    expect(shopTotal / BEGINNER).toBeGreaterThan(15);
    expect(shopTotal / BEGINNER).toBeLessThan(35);
  });

  it('laisse un débutant acheter les premiers niveaux dès sa première partie', () => {
    const early = SHOP_ITEMS.reduce((sum, it) => sum + shopCost(it, 0) + shopCost(it, 1), 0);
    expect(early).toBeLessThan(BEGINNER);
  });

  it('étage le prix des armes : la première en une partie de débutant, la dernière en quelques-unes', () => {
    const paid = WEAPONS.filter((w) => w.cost > 0 && !w.chest).sort((a, b) => a.cost - b.cost);
    expect(paid.map((w) => [w.id, w.cost])).toEqual([
      ['orbs', 400],
      ['aura', 1200],
      ['spear', 3000],
    ]);
    expect(paid[0].cost).toBeLessThanOrEqual(BEGINNER);
    expect(paid[paid.length - 1].cost).toBeLessThanOrEqual(BEGINNER * 4);
    expect(paid[paid.length - 1].cost).toBeLessThan(GOOD);
  });

  it('fait payer les apparences comme des puits à pièces', () => {
    expect(CHARACTERS.map((c) => [c.id, c.cost])).toEqual([
      ['ombre', 0],
      ['bolt', 1000],
      ['pip', 2500],
    ]);
  });

  it('garde les coffres comme grand puits de fin de jeu : un par partie pour un débutant, une dizaine pour un bon joueur', () => {
    expect(CHEST_PRICE).toBe(1000);
    expect(GOOD / CHEST_PRICE).toBeGreaterThanOrEqual(10);
    expect(BEGINNER / CHEST_PRICE).toBe(1);
    // Aucun achat unique de la boutique ne dépasse ce qu'un bon joueur gagne en une partie.
    for (const it of SHOP_ITEMS) for (let level = 0; level < it.max; level++) expect(shopCost(it, level), `${it.id} niv ${level + 1}`).toBeLessThan(GOOD);
  });
});

describe('Personnages', () => {
  it('a un personnage gratuit débloqué par défaut', () => {
    const free = CHARACTERS.filter((c) => c.cost === 0).map((c) => c.id);
    expect(free).toEqual(['ombre']);
    expect(defaultSave().unlocked).toEqual(free);
    expect(startingStats(defaultSave())).toEqual(baseStats());
  });

  it('achète puis sélectionne un personnage verrouillé', () => {
    const save = defaultSave();
    const bolt = CHARACTERS.find((c) => c.id === 'bolt')!;
    save.gold = bolt.cost - 1;
    expect(chooseCharacter(save, 'bolt')).toBe('denied');
    expect(save.selected).toBe('ombre');

    save.gold = bolt.cost + 10;
    expect(chooseCharacter(save, 'bolt')).toBe('bought');
    expect(save.gold).toBe(10);
    expect(save.selected).toBe('bolt');

    // Revenir sur un personnage déjà acheté est gratuit.
    expect(chooseCharacter(save, 'ombre')).toBe('selected');
    expect(chooseCharacter(save, 'bolt')).toBe('selected');
    expect(save.gold).toBe(10);
    expect(save.unlocked).toEqual(['ombre', 'bolt']);
    expect(chooseCharacter(save, 'inconnu')).toBe('denied');
  });

  it('ne sont qu’une apparence : aucun effet sur les caractéristiques', () => {
    const base = baseStats();
    for (const c of CHARACTERS) {
      const save = defaultSave();
      save.unlocked.push(c.id);
      save.selected = c.id;
      expect(startingStats(save), c.id).toEqual(base);
    }
  });
});

describe('Armes de départ', () => {
  it('a une arme gratuite débloquée par défaut', () => {
    expect(WEAPONS.filter((w) => w.cost === 0 && !w.chest).map((w) => w.id)).toEqual(['rifle']);
    expect(defaultSave().weapons).toEqual(['rifle']);
    expect(selectedWeapon(defaultSave()).id).toBe('rifle');
  });

  it('achète puis sélectionne une arme verrouillée', () => {
    const save = defaultSave();
    const aura = WEAPONS.find((w) => w.id === 'aura')!;
    save.gold = aura.cost - 1;
    expect(chooseWeapon(save, 'aura')).toBe('denied');
    expect(save.weapon).toBe('rifle');

    save.gold = aura.cost + 10;
    expect(chooseWeapon(save, 'aura')).toBe('bought');
    expect(save.gold).toBe(10);
    expect(save.weapon).toBe('aura');

    // Revenir sur une arme déjà débloquée est gratuit.
    expect(chooseWeapon(save, 'rifle')).toBe('selected');
    expect(chooseWeapon(save, 'aura')).toBe('selected');
    expect(save.gold).toBe(10);
    expect(save.weapons).toEqual(['rifle', 'aura']);
    expect(chooseWeapon(save, 'inconnue')).toBe('denied');
  });
});

describe('Difficulté', () => {
  it('propose des niveaux de plus en plus durs et de mieux en mieux payés', () => {
    expect(DIFFICULTIES.map((d) => d.id)).toContain('normal');
    for (let i = 1; i < DIFFICULTIES.length; i++) {
      const easier = DIFFICULTIES[i - 1];
      const harder = DIFFICULTIES[i];
      expect(harder.gold, harder.id).toBeGreaterThan(easier.gold);
      expect(harder.enemies.hp, harder.id).toBeGreaterThan(easier.enemies.hp);
      expect(harder.enemies.damage, harder.id).toBeGreaterThan(easier.enemies.damage);
      expect(harder.enemies.count, harder.id).toBeGreaterThan(easier.enemies.count);
    }
    const normal = DIFFICULTIES.find((d) => d.id === 'normal')!;
    expect(normal.gold).toBe(1);
    expect(normal.enemies).toEqual({ count: 1, hp: 1, damage: 1 });
  });

  it('se choisit, et refuse une difficulté inconnue', () => {
    const save = defaultSave();
    expect(selectedDifficulty(save).id).toBe('normal');
    expect(chooseDifficulty(save, 'hard')).toBe(true);
    expect(selectedDifficulty(save).id).toBe('hard');
    expect(chooseDifficulty(save, 'impossible')).toBe(false);
    expect(save.difficulty).toBe('hard');
  });
});

describe('Récompense de fin de partie', () => {
  it('additionne les pièces ramassées et le bonus de survie', () => {
    expect(runReward(0, 0)).toBe(0);
    expect(runReward(12.9, 59)).toBe(12 + 5);
    expect(runReward(3, 125)).toBe(3 + 12);
  });

  it('applique le multiplicateur de la difficulté au total', () => {
    expect(runReward(10, 60, 1.5)).toBe(24);
    expect(runReward(10, 60, 0.6)).toBe(9);
    expect(runReward(0, 5, 2.2)).toBe(0);
    expect(runReward(10, 60)).toBe(runReward(10, 60, 1));
  });
});
