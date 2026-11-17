import type { Run } from './run';
import { random } from './rng';
import { WEAPONS, weaponDef, type WeaponDef } from './weaponData';

export interface Upgrade {
  id: string;
  icon: string;
  name: string;
  desc: string;
  /** Nombre de fois où l'amélioration peut être prise dans une partie (niveau maximum pour une arme). */
  max: number;
  apply(run: Run): void;
}

/** Préfixe des identifiants d'amélioration qui concernent une arme. */
export const WEAPON_PREFIX = 'weapon:';

/**
 * Bonus passifs, communs à toutes les armes. Pour en ajouter un, il suffit d'ajouter une entrée à cette liste.
 * Les améliorations propres aux armes sont dans `weaponData.ts`.
 */
export const PASSIVES: Upgrade[] = [
  {
    id: 'power',
    icon: '💥',
    name: 'Force',
    desc: '+12 % de dégâts, toutes armes',
    max: 4,
    apply: ({ player }) => (player.stats.damage *= 1.12),
  },
  {
    id: 'speed',
    icon: '👟',
    name: 'Bottes',
    desc: '+10 % de vitesse',
    max: 5,
    apply: ({ player }) => (player.stats.speed *= 1.1),
  },
  {
    id: 'hp',
    icon: '❤️',
    name: 'Cœur',
    desc: '+25 PV max et soigne 10 PV',
    max: 6,
    apply: ({ player }) => {
      player.stats.maxHp += 25;
      player.heal(10);
    },
  },
  {
    id: 'regen',
    icon: '🌿',
    name: 'Régénération',
    desc: '+1 PV par seconde',
    max: 3,
    apply: ({ player }) => (player.stats.regen += 1),
  },
  {
    id: 'magnet',
    icon: '🧲',
    name: 'Aimant',
    desc: '+40 % de portée de ramassage',
    max: 4,
    apply: ({ player }) => (player.stats.magnet *= 1.4),
  },
];

/** Carte « niveau suivant » d'une arme (ou « nouvelle arme » si elle n'est pas encore portée). */
export function weaponUpgrade(def: WeaponDef, currentLevel: number): Upgrade {
  const next = def.levels[currentLevel];
  return {
    id: WEAPON_PREFIX + def.id,
    icon: def.icon,
    name: def.name,
    desc: currentLevel === 0 ? def.desc : (next?.desc ?? ''),
    max: def.levels.length,
    apply: (run) => {
      run.weapons.levelUp(def.id);
    },
  };
}

/**
 * Tire jusqu'à `count` améliorations distinctes parmi celles qui sont possibles :
 * bonus passifs pas encore au maximum, et niveau suivant de l'arme portée (le héros n'a que l'arme choisie au menu).
 */
export function rollUpgrades(levels: Map<string, number>, count: number): Upgrade[] {
  const pool: Upgrade[] = PASSIVES.filter((u) => (levels.get(u.id) ?? 0) < u.max);
  for (const def of WEAPONS) {
    const level = levels.get(WEAPON_PREFIX + def.id) ?? 0;
    if (level > 0 && level < def.levels.length) pool.push(weaponUpgrade(def, level));
  }
  const picks: Upgrade[] = [];
  while (picks.length < count && pool.length > 0) {
    picks.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return picks;
}

/** Définition d'arme d'après l'identifiant d'une amélioration, si c'en est une. */
export function weaponOfUpgrade(id: string): WeaponDef | undefined {
  return id.startsWith(WEAPON_PREFIX) ? weaponDef(id.slice(WEAPON_PREFIX.length)) : undefined;
}
