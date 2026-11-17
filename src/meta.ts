import type { EnemyMods } from './enemies';
import { baseStats, type Stats } from './player';
import { DEFAULT_WEAPON, WEAPONS, weaponDef, type WeaponDef } from './weaponData';

/** Progression conservée d'une partie à l'autre (dans le stockage local du navigateur). */
export interface SaveData {
  version: 1;
  gold: number;
  /** Meilleur temps de survie, en secondes. */
  bestTime: number;
  /** Niveau acheté de chaque amélioration permanente. */
  shop: Record<string, number>;
  /** Identifiants des apparences (personnages) débloquées. */
  unlocked: string[];
  /** Apparence choisie. */
  selected: string;
  /** Armes débloquées et arme de départ choisie. */
  weapons: string[];
  weapon: string;
  /** Identifiant de la difficulté choisie. */
  difficulty: string;
  /** Niveau 100 atteint : pour chaque arme, les difficultés avec lesquelles c'est arrivé (badge au menu). */
  legend: Record<string, string[]>;
  muted: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SAVE_KEY = 'slime-rush.save';

export interface ShopItem {
  id: string;
  icon: string;
  name: string;
  desc: string;
  max: number;
  baseCost: number;
  apply(stats: Stats, level: number): void;
}

/** Améliorations permanentes. Pour en ajouter une, ajouter une entrée à cette liste. */
export const SHOP_ITEMS: ShopItem[] = [
  { id: 'vitality', icon: '❤️', name: 'Vitalité', desc: '+10 PV max par niveau', max: 10, baseCost: 20, apply: (s, l) => (s.maxHp += 10 * l) },
  { id: 'power', icon: '💥', name: 'Puissance', desc: '+6 % de dégâts par niveau', max: 10, baseCost: 25, apply: (s, l) => (s.damage *= 1 + 0.06 * l) },
  { id: 'haste', icon: '⚡', name: 'Célérité', desc: 'Armes 4 % plus rapides par niveau', max: 8, baseCost: 25, apply: (s, l) => (s.cooldown *= 0.96 ** l) },
  { id: 'swift', icon: '👟', name: 'Agilité', desc: '+3 % de vitesse par niveau', max: 5, baseCost: 30, apply: (s, l) => (s.speed *= 1 + 0.03 * l) },
  { id: 'magnet', icon: '🧲', name: 'Magnétisme', desc: '+12 % de portée de ramassage par niveau', max: 5, baseCost: 20, apply: (s, l) => (s.magnet *= 1 + 0.12 * l) },
  { id: 'greed', icon: '🪙', name: 'Avidité', desc: "+10 % d'or par niveau", max: 5, baseCost: 40, apply: (s, l) => (s.goldMult *= 1 + 0.1 * l) },
  { id: 'wisdom', icon: '📘', name: 'Sagesse', desc: "+6 % d'XP par niveau", max: 5, baseCost: 40, apply: (s, l) => (s.xpMult *= 1 + 0.06 * l) },
];

/** Apparence du héros : aucun effet sur le jeu. */
export interface Character {
  id: string;
  name: string;
  desc: string;
  /** Fichier du modèle 3D dans public/models. */
  model: string;
  cost: number;
}

export const CHARACTERS: Character[] = [
  { id: 'ombre', name: 'Ombre', desc: 'Le héros d’origine', model: 'hero-ombre.glb', cost: 0 },
  { id: 'bolt', name: 'Bolt', desc: 'Robot bricoleur', model: 'hero-bolt.glb', cost: 150 },
  { id: 'pip', name: 'Pip', desc: 'Mascotte bondissante', model: 'hero-pip.glb', cost: 400 },
];

export interface Difficulty {
  id: string;
  icon: string;
  name: string;
  /** Réglages appliqués aux ennemis. */
  enemies: EnemyMods;
  /** Multiplie l'or rapporté en fin de partie. */
  gold: number;
}

/** Du plus doux au plus dur : plus c'est dur, plus l'or rapporté est élevé. */
export const DIFFICULTIES: Difficulty[] = [
  { id: 'easy', icon: '🌱', name: 'Facile', enemies: { count: 0.8, hp: 0.8, damage: 0.7 }, gold: 0.6 },
  { id: 'normal', icon: '⚔️', name: 'Normal', enemies: { count: 1, hp: 1, damage: 1 }, gold: 1 },
  { id: 'hard', icon: '🔥', name: 'Difficile', enemies: { count: 1.25, hp: 1.3, damage: 1.4 }, gold: 1.5 },
  { id: 'extreme', icon: '💀', name: 'Extrême', enemies: { count: 1.5, hp: 1.7, damage: 1.8 }, gold: 2.2 },
];

export const DEFAULT_DIFFICULTY = 'normal';

export function defaultSave(): SaveData {
  return {
    version: 1,
    gold: 0,
    bestTime: 0,
    shop: {},
    unlocked: ['ombre'],
    selected: 'ombre',
    weapons: [DEFAULT_WEAPON],
    weapon: DEFAULT_WEAPON,
    difficulty: DEFAULT_DIFFICULTY,
    legend: {},
    muted: false,
  };
}

/** Stockage local du navigateur, ou null s'il est indisponible (navigation privée...). */
export function browserStorage(): StorageLike | null {
  try {
    const storage = window.localStorage;
    storage.getItem(SAVE_KEY);
    return storage;
  } catch {
    return null;
  }
}

/** Charge la sauvegarde en tolérant les données absentes, corrompues ou incomplètes. */
export function loadSave(storage: StorageLike | null): SaveData {
  const save = defaultSave();
  if (!storage) return save;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return save;
    return sanitizeSave(JSON.parse(raw));
  } catch {
    // Sauvegarde illisible : on repart d'une sauvegarde neuve plutôt que de planter.
    return defaultSave();
  }
}

/** Reconstruit une sauvegarde valide à partir de données quelconques : tout ce qui est invalide est ignoré. */
function sanitizeSave(raw: unknown): SaveData {
  const save = defaultSave();
  if (typeof raw !== 'object' || raw === null) return save;
  const data = raw as Partial<SaveData>;

  if (Number.isFinite(data.gold)) save.gold = Math.max(0, Math.floor(data.gold!));
  if (Number.isFinite(data.bestTime)) save.bestTime = Math.max(0, data.bestTime!);
  if (typeof data.muted === 'boolean') save.muted = data.muted;
  if (data.shop && typeof data.shop === 'object') {
    for (const item of SHOP_ITEMS) {
      const level = Number(data.shop[item.id]);
      if (Number.isFinite(level) && level > 0) save.shop[item.id] = Math.min(item.max, Math.floor(level));
    }
  }
  if (Array.isArray(data.unlocked)) {
    for (const c of CHARACTERS) {
      if (data.unlocked.includes(c.id) && !save.unlocked.includes(c.id)) save.unlocked.push(c.id);
    }
  }
  if (typeof data.selected === 'string' && save.unlocked.includes(data.selected)) save.selected = data.selected;
  if (Array.isArray(data.weapons)) {
    for (const w of WEAPONS) {
      if (data.weapons.includes(w.id) && !save.weapons.includes(w.id)) save.weapons.push(w.id);
    }
  }
  if (typeof data.weapon === 'string' && save.weapons.includes(data.weapon)) save.weapon = data.weapon;
  // Une ancienne sauvegarde (liste d'armes sans difficulté) est ignorée : seul le format par difficulté est lu.
  if (data.legend && typeof data.legend === 'object' && !Array.isArray(data.legend)) {
    for (const w of WEAPONS) {
      const levels = (data.legend as Record<string, unknown>)[w.id];
      if (!Array.isArray(levels)) continue;
      const known = DIFFICULTIES.filter((d) => levels.includes(d.id)).map((d) => d.id);
      if (known.length > 0) save.legend[w.id] = known;
    }
  }
  if (typeof data.difficulty === 'string' && DIFFICULTIES.some((d) => d.id === data.difficulty)) save.difficulty = data.difficulty;
  return save;
}

/** En-tête des codes de sauvegarde : permet de rejeter un texte qui n'en est pas un. */
const EXPORT_PREFIX = 'SLIMERUSH1:';

/** Code texte à copier ou à enregistrer pour transporter la sauvegarde vers un autre navigateur ou appareil. */
export function exportSave(save: SaveData): string {
  return EXPORT_PREFIX + btoa(JSON.stringify(save));
}

/**
 * Relit un code produit par exportSave. Renvoie null si le texte n'est pas un code de sauvegarde.
 * Les valeurs sont nettoyées comme au chargement : un code modifié à la main ne peut pas donner un état invalide.
 */
export function importSave(text: string): SaveData | null {
  // Les messageries ajoutent volontiers des espaces ou des retours à la ligne.
  const code = text.replace(/\s+/g, '');
  if (!code.startsWith(EXPORT_PREFIX)) return null;
  try {
    const data: unknown = JSON.parse(atob(code.slice(EXPORT_PREFIX.length)));
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
    return sanitizeSave(data);
  } catch {
    return null;
  }
}

export function persistSave(storage: StorageLike | null, save: SaveData): void {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Stockage plein ou refusé : la progression ne sera simplement pas conservée.
  }
}

/** Prix du prochain niveau d'une amélioration (arrondi à 5 pièces). */
export function shopCost(item: ShopItem, level: number): number {
  return Math.round((item.baseCost * 1.6 ** level) / 5) * 5;
}

/** Achète un niveau d'amélioration. Renvoie false si c'est impossible (or insuffisant, maximum atteint). */
export function buyShopItem(save: SaveData, id: string): boolean {
  const item = SHOP_ITEMS.find((i) => i.id === id);
  if (!item) return false;
  const level = save.shop[id] ?? 0;
  const cost = shopCost(item, level);
  if (level >= item.max || save.gold < cost) return false;
  save.gold -= cost;
  save.shop[id] = level + 1;
  return true;
}

/** Vrai si le niveau 100 a été atteint avec cette arme à cette difficulté (par défaut, la difficulté choisie). */
export function hasLegend(save: SaveData, weaponId: string, difficultyId = save.difficulty): boolean {
  return save.legend[weaponId]?.includes(difficultyId) ?? false;
}

/** Enregistre le niveau 100 atteint avec cette arme à cette difficulté. Renvoie false si c'était déjà noté ou inconnu. */
export function addLegend(save: SaveData, weaponId: string, difficultyId: string): boolean {
  if (!weaponDef(weaponId) || !DIFFICULTIES.some((d) => d.id === difficultyId)) return false;
  if (hasLegend(save, weaponId, difficultyId)) return false;
  const known = new Set([...(save.legend[weaponId] ?? []), difficultyId]);
  // Toujours dans l'ordre des difficultés, pour une sauvegarde stable.
  save.legend[weaponId] = DIFFICULTIES.filter((d) => known.has(d.id)).map((d) => d.id);
  return true;
}

/** Sélectionne un personnage, en l'achetant d'abord s'il est verrouillé. */
export function chooseCharacter(save: SaveData, id: string): 'selected' | 'bought' | 'denied' {
  const character = CHARACTERS.find((c) => c.id === id);
  if (!character) return 'denied';
  if (save.unlocked.includes(id)) {
    save.selected = id;
    return 'selected';
  }
  if (save.gold < character.cost) return 'denied';
  save.gold -= character.cost;
  save.unlocked.push(id);
  save.selected = id;
  return 'bought';
}

/** Sélectionne une arme de départ, en la débloquant d'abord (contre de l'or) si elle est verrouillée. */
export function chooseWeapon(save: SaveData, id: string): 'selected' | 'bought' | 'denied' {
  const weapon = weaponDef(id);
  if (!weapon) return 'denied';
  if (save.weapons.includes(id)) {
    save.weapon = id;
    return 'selected';
  }
  if (save.gold < weapon.cost) return 'denied';
  save.gold -= weapon.cost;
  save.weapons.push(id);
  save.weapon = id;
  return 'bought';
}

export function selectedWeapon(save: SaveData): WeaponDef {
  return weaponDef(save.weapon) ?? WEAPONS[0];
}

/** Choisit la difficulté. Renvoie false si elle n'existe pas. */
export function chooseDifficulty(save: SaveData, id: string): boolean {
  if (!DIFFICULTIES.some((d) => d.id === id)) return false;
  save.difficulty = id;
  return true;
}

export function selectedDifficulty(save: SaveData): Difficulty {
  return DIFFICULTIES.find((d) => d.id === save.difficulty) ?? DIFFICULTIES[1];
}

export function selectedCharacter(save: SaveData): Character {
  return CHARACTERS.find((c) => c.id === save.selected) ?? CHARACTERS[0];
}

/** Caractéristiques de départ : base + améliorations permanentes de la boutique. */
export function startingStats(save: SaveData): Stats {
  const stats = baseStats();
  for (const item of SHOP_ITEMS) {
    const level = save.shop[item.id] ?? 0;
    if (level > 0) item.apply(stats, level);
  }
  return stats;
}

/** Or rapporté par une partie : pièces ramassées + 1 pièce par tranche de 10 s de survie, multiplié selon la difficulté. */
export function runReward(gold: number, time: number, multiplier = 1): number {
  return Math.floor((Math.floor(gold) + Math.floor(time / 10)) * multiplier);
}
