import { AMULETS, amuletOf } from './amulets';
import { CATEGORY_LABELS, cosmeticOf, lootableCosmetics, type CosmeticCategory } from './cosmetics';
import { CHARACTERS, type SaveData } from './meta';
import { WEAPONS, weaponDef } from './weaponData';

/** Un coffre à 1000 pièces, ou trois coffres d'un coup pour 2500 pièces. */
export const CHEST_PRICE = 1000;
export const CHEST_BUNDLE = { count: 3, price: 2500 };

/** Prix d'un coffre et d'un lot de trois. Remplaçables (le mode dev les ramène à 1 et 2 pièces). */
export interface ChestPrices {
  single: number;
  bundle: number;
}

export const CHEST_PRICES: ChestPrices = { single: CHEST_PRICE, bundle: CHEST_BUNDLE.price };

/** Répartition du contenu : ~1 % d'arme exclusive, puis amulette, apparence, héros exclusif (5 % en tout) ou pièces. */
export const CHEST_ODDS = { weapon: 0.01, amulet: 0.38, cosmetic: 0.32, character: 0.05 };
/** Pièces : tranches de montants (de 200 à 10 000), les petites étant les plus fréquentes. */
export const COIN_TIERS = [
  { weight: 50, min: 200, max: 400 },
  { weight: 30, min: 400, max: 800 },
  { weight: 14, min: 800, max: 1500 },
  { weight: 4.5, min: 1500, max: 3000 },
  { weight: 1.3, min: 3000, max: 6000 },
  { weight: 0.2, min: 6000, max: 10000 },
];

/**
 * Rareté d'un contenu : elle seule décide du son, du flash et des confettis (deux contenus de même rareté
 * ont donc le même). Mythique : l'arme exclusive (~1 %) ; légendaire : héros exclusif et pièces ≥ 3 000 ;
 * rare : amulette, apparence et pièces de 1 000 à 3 000 ; commun : pièces en dessous de 1 000.
 */
export type ChestTier = 'common' | 'rare' | 'legendary' | 'mythic';

/** Montants de pièces à partir desquels le contenu est rare, puis légendaire. */
export const COIN_RARE_FROM = 1000;
export const COIN_LEGENDARY_FROM = 3000;

export type ChestReward =
  | { type: 'weapon'; id: string }
  | { type: 'amulet'; id: string }
  | { type: 'cosmetic'; category: CosmeticCategory; id: string }
  | { type: 'character'; id: string }
  | { type: 'coins'; amount: number };

/** Générateur de nombres dans [0, 1). Remplaçable pour des tirages reproductibles. */
export type Rng = () => number;

const pick = <T>(list: T[], rng: Rng): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

/** Armes que seuls les coffres donnent, et que le joueur n'a pas encore. */
export function missingChestWeapons(save: SaveData): string[] {
  return WEAPONS.filter((w) => w.chest && !save.weapons.includes(w.id)).map((w) => w.id);
}

/** Héros que seuls les coffres donnent, et que le joueur n'a pas encore. */
export function missingChestCharacters(save: SaveData): string[] {
  return CHARACTERS.filter((c) => c.chest && !save.unlocked.includes(c.id)).map((c) => c.id);
}

/** Apparences gagnables que le joueur n'a pas encore. */
export function missingCosmetics(save: SaveData): { category: CosmeticCategory; id: string }[] {
  return lootableCosmetics().filter((c) => !save.cosmetics[c.category].includes(c.id));
}

/** Pièces gagnées : montant tiré dans une tranche, les petites tranches étant les plus fréquentes. */
export function rollCoins(rng: Rng): number {
  const total = COIN_TIERS.reduce((sum, t) => sum + t.weight, 0);
  let roll = rng() * total;
  const tier = COIN_TIERS.find((t) => (roll -= t.weight) < 0) ?? COIN_TIERS[0];
  // Arrondi à la dizaine : des montants lisibles.
  return Math.round((tier.min + rng() * (tier.max - tier.min)) / 10) * 10;
}

/**
 * Tire le contenu d'un coffre, sans modifier la sauvegarde. Quand un type n'est plus disponible
 * (plus d'arme exclusive ou d'apparence à gagner), le tirage donne des pièces à la place.
 */
export function rollChest(save: SaveData, rng: Rng): ChestReward {
  const roll = rng();
  const weapons = missingChestWeapons(save);
  if (roll < CHEST_ODDS.weapon && weapons.length > 0) return { type: 'weapon', id: pick(weapons, rng) };
  if (roll < CHEST_ODDS.weapon + CHEST_ODDS.amulet) return { type: 'amulet', id: pick(AMULETS, rng).id };
  if (roll < CHEST_ODDS.weapon + CHEST_ODDS.amulet + CHEST_ODDS.cosmetic) {
    const missing = missingCosmetics(save);
    if (missing.length > 0) {
      const found = pick(missing, rng);
      return { type: 'cosmetic', category: found.category, id: found.id };
    }
  } else if (roll < CHEST_ODDS.weapon + CHEST_ODDS.amulet + CHEST_ODDS.cosmetic + CHEST_ODDS.character) {
    const characters = missingChestCharacters(save);
    if (characters.length > 0) return { type: 'character', id: pick(characters, rng) };
  }
  return { type: 'coins', amount: rollCoins(rng) };
}

/** Range le contenu d'un coffre dans la sauvegarde. */
export function applyReward(save: SaveData, reward: ChestReward): void {
  switch (reward.type) {
    case 'weapon':
      if (!save.weapons.includes(reward.id)) save.weapons.push(reward.id);
      break;
    case 'amulet':
      save.amulets[reward.id] = (save.amulets[reward.id] ?? 0) + 1;
      break;
    case 'cosmetic':
      if (!save.cosmetics[reward.category].includes(reward.id)) save.cosmetics[reward.category].push(reward.id);
      break;
    case 'character':
      if (!save.unlocked.includes(reward.id)) save.unlocked.push(reward.id);
      break;
    case 'coins':
      save.gold += reward.amount;
      break;
  }
}

/** Prix d'une ouverture de `count` coffres (1 ou le lot), ou null si ce n'est pas une offre. */
export function chestPrice(count: number, prices: ChestPrices = CHEST_PRICES): number | null {
  if (count === 1) return prices.single;
  if (count === CHEST_BUNDLE.count) return prices.bundle;
  return null;
}

/**
 * Ouvre `count` coffres : débite le prix, tire puis range chaque contenu (l'un après l'autre : un contenu
 * déjà obtenu ne peut pas ressortir). Renvoie null, sans rien changer, si l'offre n'existe pas ou si l'or manque.
 */
export function openChests(save: SaveData, count: number, rng: Rng, prices: ChestPrices = CHEST_PRICES): ChestReward[] | null {
  const price = chestPrice(count, prices);
  if (price === null || save.gold < price) return null;
  save.gold -= price;
  const rewards: ChestReward[] = [];
  for (let i = 0; i < count; i++) {
    const reward = rollChest(save, rng);
    applyReward(save, reward);
    rewards.push(reward);
  }
  return rewards;
}

/** Texte et pictogramme d'un contenu, pour l'affichage. `label` est l'annonce en gros sur la carte plein écran. */
export function rewardView(reward: ChestReward): {
  icon: string;
  title: string;
  subtitle: string;
  label: string;
  tier: ChestTier;
  /** Pour des pièces : le montant, que l'écran fait défiler de 0 jusqu'à lui. */
  amount?: number;
} {
  switch (reward.type) {
    case 'weapon': {
      const w = weaponDef(reward.id);
      return { icon: w?.icon ?? '🎁', title: w?.name ?? reward.id, subtitle: 'Arme exclusive aux coffres', label: 'Nouvelle arme secrète !', tier: 'mythic' };
    }
    case 'amulet': {
      const a = amuletOf(reward.id);
      return { icon: a?.icon ?? '🧿', title: a?.name ?? reward.id, subtitle: `${a?.describe(1) ?? ''} · une seule partie`, label: 'Amulette', tier: 'rare' };
    }
    case 'cosmetic': {
      const c = cosmeticOf(reward.category, reward.id);
      return { icon: '🎨', title: c?.name ?? reward.id, subtitle: CATEGORY_LABELS[reward.category], label: 'Nouvelle apparence', tier: 'rare' };
    }
    case 'character': {
      const c = CHARACTERS.find((h) => h.id === reward.id);
      return { icon: '👑', title: c?.name ?? reward.id, subtitle: `Héros exclusif aux coffres · ${c?.desc ?? ''}`, label: 'Nouveau héros !', tier: 'legendary' };
    }
    case 'coins': {
      // Moins de 1 000 : commun ; de 1 000 à 3 000 : rare ; 3 000 et plus : légendaire (jackpot).
      const tier: ChestTier = reward.amount >= COIN_LEGENDARY_FROM ? 'legendary' : reward.amount >= COIN_RARE_FROM ? 'rare' : 'common';
      const subtitle = tier === 'legendary' ? 'Un énorme trésor !' : tier === 'rare' ? 'Un beau trésor' : 'Un petit trésor';
      return { icon: '🪙', title: `${reward.amount} pièces`, subtitle, label: tier === 'legendary' ? 'Jackpot !' : 'Pièces', tier, amount: reward.amount };
    }
  }
}
