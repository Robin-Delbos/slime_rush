import type { Player } from './player';
import { random } from './rng';

export interface Upgrade {
  id: string;
  icon: string;
  name: string;
  desc: string;
  /** Nombre de fois où l'amélioration peut être prise dans une partie. */
  max: number;
  apply(player: Player): void;
}

/** Pour ajouter une amélioration, il suffit d'ajouter une entrée à cette liste. */
export const UPGRADES: Upgrade[] = [
  {
    id: 'damage',
    icon: '💥',
    name: 'Force',
    desc: '+25 % de dégâts',
    max: 8,
    apply: (p) => (p.stats.damage *= 1.25),
  },
  {
    id: 'rate',
    icon: '⚡',
    name: 'Cadence',
    desc: 'Tire 15 % plus vite',
    max: 6,
    apply: (p) => (p.stats.fireInterval *= 0.85),
  },
  {
    id: 'multi',
    icon: '🎯',
    name: 'Tir multiple',
    desc: '+1 projectile par salve',
    max: 4,
    apply: (p) => (p.stats.projectiles += 1),
  },
  {
    id: 'pierce',
    icon: '🏹',
    name: 'Perforation',
    desc: 'Les tirs traversent 1 ennemi de plus',
    max: 3,
    apply: (p) => (p.stats.pierce += 1),
  },
  {
    id: 'orb',
    icon: '🔮',
    name: 'Orbe gardien',
    desc: '+1 orbe qui tourne autour de vous',
    max: 5,
    apply: (p) => (p.stats.orbs += 1),
  },
  {
    id: 'speed',
    icon: '👟',
    name: 'Bottes',
    desc: '+10 % de vitesse',
    max: 5,
    apply: (p) => (p.stats.speed *= 1.1),
  },
  {
    id: 'hp',
    icon: '❤️',
    name: 'Cœur',
    desc: '+25 PV max et soigne 25 PV',
    max: 8,
    apply: (p) => {
      p.stats.maxHp += 25;
      p.heal(25);
    },
  },
  {
    id: 'regen',
    icon: '🌿',
    name: 'Régénération',
    desc: '+1 PV par seconde',
    max: 5,
    apply: (p) => (p.stats.regen += 1),
  },
  {
    id: 'magnet',
    icon: '🧲',
    name: 'Aimant',
    desc: '+40 % de portée de ramassage',
    max: 4,
    apply: (p) => (p.stats.magnet *= 1.4),
  },
];

/** Tire jusqu'à `count` améliorations distinctes parmi celles qui ne sont pas au maximum. */
export function rollUpgrades(levels: Map<string, number>, count: number): Upgrade[] {
  const pool = UPGRADES.filter((u) => (levels.get(u.id) ?? 0) < u.max);
  const picks: Upgrade[] = [];
  while (picks.length < count && pool.length > 0) {
    picks.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return picks;
}
