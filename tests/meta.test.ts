import { describe, expect, it } from 'vitest';
import {
  CHARACTERS,
  SAVE_KEY,
  SHOP_ITEMS,
  buyShopItem,
  chooseCharacter,
  defaultSave,
  exportSave,
  importSave,
  loadSave,
  persistSave,
  runReward,
  shopCost,
  startingStats,
  type StorageLike,
} from '../src/meta';
import { baseStats } from '../src/player';

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
    save.unlocked = ['pip', 'bolt'];
    save.selected = 'bolt';
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
      selected: 'ombre',
    });
    const save = loadSave(memoryStorage({ [SAVE_KEY]: raw }));
    expect(save.gold).toBe(0);
    expect(save.bestTime).toBe(0);
    expect(save.shop).toEqual({ vitality: SHOP_ITEMS.find((i) => i.id === 'vitality')!.max });
    expect(save.unlocked).toEqual(['pip', 'bolt']);
    // 'ombre' n'est pas débloqué : on garde le personnage par défaut.
    expect(save.selected).toBe('pip');
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
    save.unlocked = ['pip', 'bolt'];
    save.selected = 'bolt';
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
    const forged = `SLIMERUSH1:${btoa(JSON.stringify({ gold: -5, shop: { vitality: 999 }, unlocked: ['pirate'], selected: 'ombre' }))}`;
    const save = importSave(forged)!;
    expect(save.gold).toBe(0);
    expect(save.shop.vitality).toBe(SHOP_ITEMS.find((i) => i.id === 'vitality')!.max);
    expect(save.unlocked).toEqual(['pip']);
    expect(save.selected).toBe('pip');
  });

  it('ne modifie pas la sauvegarde exportée et renvoie une copie indépendante', () => {
    const save = richSave();
    const copy = importSave(exportSave(save))!;
    copy.shop.vitality = 9;
    copy.unlocked.push('ombre');
    expect(save).toEqual(richSave());
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
    expect(stats.fireInterval).toBeLessThan(base.fireInterval);
  });
});

describe('Personnages', () => {
  it('a un personnage gratuit débloqué par défaut', () => {
    const free = CHARACTERS.filter((c) => c.cost === 0).map((c) => c.id);
    expect(free).toEqual(['pip']);
    expect(defaultSave().unlocked).toEqual(free);
    expect(startingStats(defaultSave())).toEqual(baseStats());
  });

  it('achète puis sélectionne un personnage verrouillé', () => {
    const save = defaultSave();
    const bolt = CHARACTERS.find((c) => c.id === 'bolt')!;
    save.gold = bolt.cost - 1;
    expect(chooseCharacter(save, 'bolt')).toBe('denied');
    expect(save.selected).toBe('pip');

    save.gold = bolt.cost + 10;
    expect(chooseCharacter(save, 'bolt')).toBe('bought');
    expect(save.gold).toBe(10);
    expect(save.selected).toBe('bolt');

    // Revenir sur un personnage déjà acheté est gratuit.
    expect(chooseCharacter(save, 'pip')).toBe('selected');
    expect(chooseCharacter(save, 'bolt')).toBe('selected');
    expect(save.gold).toBe(10);
    expect(save.unlocked).toEqual(['pip', 'bolt']);
    expect(chooseCharacter(save, 'inconnu')).toBe('denied');
  });

  it('donne à chaque personnage payant des caractéristiques différentes', () => {
    const base = baseStats();
    for (const c of CHARACTERS.filter((c) => c.cost > 0)) {
      const save = defaultSave();
      save.unlocked.push(c.id);
      save.selected = c.id;
      expect(startingStats(save), c.id).not.toEqual(base);
    }
  });
});

describe('Récompense de fin de partie', () => {
  it('additionne les pièces ramassées et le bonus de survie', () => {
    expect(runReward(0, 0)).toBe(0);
    expect(runReward(12.9, 59)).toBe(12 + 5);
    expect(runReward(3, 125)).toBe(3 + 12);
  });
});
