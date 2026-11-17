import type { Stats } from './player';

/**
 * Amulettes : trouvées dans les coffres, équipées avant une partie. L'effet ne dure que pour cette partie :
 * l'amulette est consommée au lancement. Chaque exemplaire en plus renforce l'effet (jusqu'à 3 utilisés d'un coup).
 */
export interface Amulet {
  id: string;
  icon: string;
  name: string;
  /** Effet décrit pour un niveau donné (1 à AMULET_MAX_LEVEL). */
  describe(level: number): string;
  apply(stats: Stats, level: number): void;
}

/** Nombre maximum d'exemplaires utilisables en même temps (donc niveau maximum). */
export const AMULET_MAX_LEVEL = 3;

/** Cadre commun des icônes dessinées : trait sombre arrondi, comme les autres icônes du jeu. */
const svg = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><g stroke="#2a1f14" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${inner}</g></svg>`;

/** Œil de sage : un médaillon d'or serti d'un grand œil bleu. */
const SAGE_ICON = svg(
  '<path d="M26 13Q32 3 38 13" fill="none" stroke="#7a4a24" stroke-width="3"/>' +
    '<circle cx="32" cy="37" r="22" fill="#ffd36a"/>' +
    '<circle cx="32" cy="37" r="17.5" fill="none" stroke="#b8760f" stroke-width="1.5"/>' +
    '<path d="M13 37Q32 19 51 37Q32 55 13 37Z" fill="#fff"/>' +
    '<circle cx="32" cy="37" r="9" fill="#3b82f6"/>' +
    '<circle cx="32" cy="37" r="4" fill="#161a2a" stroke="none"/>' +
    '<circle cx="29.5" cy="34.5" r="2" fill="#fff" stroke="none"/>',
);

/** Cœur de pierre : un cœur de roche fissuré, avec une braise rouge au centre. */
const STONE_ICON = svg(
  '<defs><linearGradient id="am-stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b3bacb"/><stop offset="1" stop-color="#5b6478"/></linearGradient></defs>' +
    '<path d="M32 56C9 40 7 19 21 15C27 13.5 31 17 32 21C33 17 37 13.5 43 15C57 19 55 40 32 56Z" fill="url(#am-stone)"/>' +
    '<path d="M24 21L28 29L23 34L29 42" fill="none" stroke="#3a4152" stroke-width="2"/>' +
    '<circle cx="36" cy="33" r="6" fill="#ff4d3a"/>' +
    '<circle cx="34.5" cy="31.5" r="2" fill="#ffd0a0" stroke="none"/>',
);

/** Bourse sans fond : un sac de pièces noué, avec des pièces d'or qui débordent. */
const PURSE_ICON = svg(
  '<path d="M21 25Q8 43 17 55Q32 62 47 55Q56 43 43 25Z" fill="#c9803a"/>' +
    '<path d="M23 25Q32 19 41 25" fill="#e0a05a"/>' +
    '<path d="M21 25Q32 31 43 25" fill="none"/>' +
    '<rect x="26" y="22" width="12" height="5" rx="2.5" fill="#e0b34a"/>' +
    '<circle cx="32" cy="43" r="8" fill="#ffd84d"/>' +
    '<path d="M32 38.5v9M29.5 41Q32 38.5 34.5 41Q32 43.5 29.5 45.5Q32 48 34.5 45.5" fill="none" stroke="#8a5a0a" stroke-width="1.6"/>' +
    '<circle cx="27" cy="13" r="5.5" fill="#ffd84d"/>' +
    '<circle cx="39" cy="9" r="5" fill="#ffc93c"/>',
);

/** Plume de vent : une plume claire portée par deux traits de vent. */
const FEATHER_ICON = svg(
  '<defs><linearGradient id="am-feather" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#8fd8ff"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>' +
    '<path d="M12 54Q6 22 44 8Q56 34 22 56Z" fill="url(#am-feather)"/>' +
    '<path d="M12 54L46 10" fill="none"/>' +
    '<path d="M22 44L30 42M27 35L36 33M32 27L40 25" fill="none" stroke-width="1.8"/>' +
    '<path d="M44 52Q52 52 54 46M48 58Q58 58 60 50" fill="none" stroke="#5fb0e8" stroke-width="2.5"/>',
);

/** Croc de loup : une dent recourbée accrochée à un cordon. */
const FANG_ICON = svg(
  '<circle cx="32" cy="9" r="4.5" fill="#d9a05a"/>' +
    '<path d="M32 13Q24 14 21 21" fill="none" stroke="#a5532e" stroke-width="3"/>' +
    '<path d="M16 18Q46 14 50 32Q51 48 36 59Q38 44 31 35Q22 28 16 18Z" fill="#fff6dc"/>' +
    '<path d="M24 22Q38 22 43 33" fill="none" stroke="#d9c79a" stroke-width="2"/>' +
    '<path d="M29 26L31 31L36 30" fill="none" stroke="#d9c79a" stroke-width="1.6"/>',
);

/** Pierre tourbillon : une gemme bleue habitée d'une spirale. */
const WHIRL_ICON = svg(
  '<defs><radialGradient id="am-whirl" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#b8f4ff"/><stop offset="0.5" stop-color="#3fc3e8"/><stop offset="1" stop-color="#1b6fa8"/></radialGradient></defs>' +
    '<circle cx="32" cy="34" r="23" fill="url(#am-whirl)"/>' +
    '<path d="M32 34a3 3 0 1 1 4.5 2.6a8 8 0 1 1-10.5-6.8a13 13 0 1 1 17.5 11" fill="none" stroke="#fff" stroke-width="3"/>' +
    '<path d="M50 10l1.6 3.8 3.9.4-3 2.6.9 3.9-3.4-2-3.4 2 .9-3.9-3-2.6 3.9-.4z" fill="#ffd84d" stroke="#b8760f" stroke-width="1"/>',
);

export const AMULETS: Amulet[] = [
  {
    id: 'sage',
    icon: SAGE_ICON,
    name: 'Œil de sage',
    describe: (l) => `+${25 * l} % d'XP`,
    apply: (s, l) => (s.xpMult *= 1 + 0.25 * l),
  },
  {
    id: 'stone',
    icon: STONE_ICON,
    name: 'Cœur de pierre',
    describe: (l) => `+${30 * l} PV max`,
    apply: (s, l) => (s.maxHp += 30 * l),
  },
  {
    id: 'purse',
    icon: PURSE_ICON,
    name: 'Bourse sans fond',
    describe: (l) => `+${30 * l} % de pièces`,
    apply: (s, l) => (s.goldMult *= 1 + 0.3 * l),
  },
  {
    id: 'feather',
    icon: FEATHER_ICON,
    name: 'Plume de vent',
    describe: (l) => `+${8 * l} % de vitesse`,
    apply: (s, l) => (s.speed *= 1 + 0.08 * l),
  },
  {
    id: 'fang',
    icon: FANG_ICON,
    name: 'Croc de loup',
    describe: (l) => `+${10 * l} % de dégâts`,
    apply: (s, l) => (s.damage *= 1 + 0.1 * l),
  },
  {
    id: 'whirl',
    icon: WHIRL_ICON,
    name: 'Pierre tourbillon',
    describe: (l) => `+${35 * l} % de portée de ramassage`,
    apply: (s, l) => (s.magnet *= 1 + 0.35 * l),
  },
];

export function amuletOf(id: string): Amulet | undefined {
  return AMULETS.find((a) => a.id === id);
}

/** Applique une amulette (au niveau donné, borné entre 1 et le maximum) aux caractéristiques de départ. */
export function applyAmulet(stats: Stats, id: string, level: number): void {
  const amulet = amuletOf(id);
  if (!amulet) return;
  amulet.apply(stats, Math.min(AMULET_MAX_LEVEL, Math.max(1, Math.floor(level))));
}
