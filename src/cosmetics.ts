/**
 * Apparences à collectionner dans les coffres : couleur des projectiles, traînée derrière eux,
 * poussière sous les pas. Sans effet sur le jeu. Données pures (aucun rendu).
 */

export type CosmeticCategory = 'projectile' | 'trail' | 'dust';

export interface Cosmetic {
  id: string;
  name: string;
  /** Couleur 0xRRGGBB, 'rainbow' (change en continu), ou null pour la couleur d'origine du jeu. */
  color: number | 'rainbow' | null;
}

export const CATEGORIES: CosmeticCategory[] = ['projectile', 'trail', 'dust'];

export const CATEGORY_LABELS: Record<CosmeticCategory, string> = {
  projectile: 'Projectiles',
  trail: 'Traînées',
  dust: 'Poussière des pas',
};

/** Ce que change chaque catégorie, en une phrase. */
export const CATEGORY_HELP: Record<CosmeticCategory, string> = {
  projectile: 'Couleur des projectiles (balles, lances) et de l’éclat au départ du tir.',
  trail: 'Traînée lumineuse qui suit chaque projectile.',
  dust: 'Petits nuages que le héros soulève sous ses pieds quand il marche.',
};

/**
 * Armes concernées : 'projectiles' = celles qui tirent des balles ou des lances (voir `projectiles` dans weaponData.ts),
 * 'all' = toutes.
 */
export const CATEGORY_WEAPONS: Record<CosmeticCategory, 'projectiles' | 'all'> = {
  projectile: 'projectiles',
  trail: 'projectiles',
  dust: 'all',
};

/** Identifiant de l'apparence de départ, possédée d'office dans chaque catégorie. */
export const DEFAULT_COSMETIC = 'default';

export const COSMETICS: Record<CosmeticCategory, Cosmetic[]> = {
  projectile: [
    { id: 'default', name: 'Classique', color: null },
    { id: 'crimson', name: 'Écarlate', color: 0xff4d5e },
    { id: 'cyan', name: 'Glacial', color: 0x6fe9ff },
    { id: 'pink', name: 'Bonbon', color: 0xff7ad9 },
    { id: 'lime', name: 'Acide', color: 0x9dff5a },
    { id: 'violet', name: 'Nébuleuse', color: 0xb46bff },
    { id: 'rainbow', name: 'Arc-en-ciel', color: 'rainbow' },
  ],
  trail: [
    { id: 'default', name: 'Classique', color: null },
    { id: 'flame', name: 'Flammes', color: 0xff8a3d },
    { id: 'ice', name: 'Givre', color: 0x9fe6ff },
    { id: 'toxic', name: 'Toxique', color: 0x8dff6f },
    { id: 'shadow', name: 'Ombre', color: 0x7a4bb5 },
    { id: 'rainbow', name: 'Arc-en-ciel', color: 'rainbow' },
  ],
  dust: [
    { id: 'default', name: 'Sable', color: null },
    { id: 'ash', name: 'Cendres', color: 0xb8b8c0 },
    { id: 'leaves', name: 'Feuilles', color: 0x7fd35a },
    { id: 'gold', name: 'Étincelles', color: 0xffd84d },
    { id: 'snow', name: 'Neige', color: 0xffffff },
    { id: 'rainbow', name: 'Arc-en-ciel', color: 'rainbow' },
  ],
};

export type CosmeticStyle = Record<CosmeticCategory, string>;
export type CosmeticOwned = Record<CosmeticCategory, string[]>;

export function defaultStyle(): CosmeticStyle {
  return { projectile: DEFAULT_COSMETIC, trail: DEFAULT_COSMETIC, dust: DEFAULT_COSMETIC };
}

export function defaultOwned(): CosmeticOwned {
  return { projectile: [DEFAULT_COSMETIC], trail: [DEFAULT_COSMETIC], dust: [DEFAULT_COSMETIC] };
}

export function cosmeticOf(category: CosmeticCategory, id: string): Cosmetic | undefined {
  return COSMETICS[category].find((c) => c.id === id);
}

/** Toutes les apparences gagnables dans un coffre (donc toutes sauf celles de départ). */
export function lootableCosmetics(): { category: CosmeticCategory; id: string }[] {
  return CATEGORIES.flatMap((category) => COSMETICS[category].filter((c) => c.id !== DEFAULT_COSMETIC).map((c) => ({ category, id: c.id })));
}

/** Couleur d'une apparence : nombre, 'rainbow', ou null (couleur d'origine). */
export function cosmeticColor(category: CosmeticCategory, id: string): number | 'rainbow' | null {
  return cosmeticOf(category, id)?.color ?? null;
}
