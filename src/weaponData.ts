/**
 * Catalogue des armes : données pures, sans rendu (utilisées par la simulation, le menu et les tests).
 * Chaque arme a une liste de niveaux ; le niveau N donne les valeurs cumulées de `levels[N - 1]`.
 */

export interface WeaponLevel {
  /** Ce que ce niveau apporte, affiché sur la carte d'amélioration. */
  desc: string;
  /** Multiple des dégâts de base du héros, pour un coup. */
  damage: number;
  /** Secondes entre deux tirs / pulsations (ou entre deux coups d'un même orbe sur un même ennemi). */
  interval: number;
  /** Nombre de projectiles, d'orbes ou de lances. */
  count: number;
  /** Ennemis supplémentaires traversés par un projectile. */
  pierce: number;
  /** Taille de l'effet : rayon de l'aura, distance des orbes, largeur de la lance. */
  area: number;
}

export interface WeaponDef {
  id: string;
  icon: string;
  name: string;
  /** Style de jeu, affiché au menu et quand l'arme est proposée en partie. */
  desc: string;
  /** Prix de déblocage dans le menu (0 = disponible dès le départ). */
  cost: number;
  /** Arme exclusive aux coffres : absente de la boutique, invisible au menu tant qu'elle n'est pas trouvée. */
  chest?: boolean;
  levels: WeaponLevel[];
}

const lv = (desc: string, damage: number, interval: number, count: number, pierce: number, area: number): WeaponLevel => ({
  desc,
  damage,
  interval,
  count,
  pierce,
  area,
});

/**
 * Icône dessinée de la carabine (SVG, vue de profil, légèrement inclinée), à la place d'un emoji.
 * Une icône peut être un texte (emoji) ou un SVG complet : l'interface reconnaît ce dernier à son début.
 */
const RIFLE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true">' +
  '<g transform="rotate(-14 32 32)" stroke="#2a1f14" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">' +
  '<path d="M3 33 L21 29 L23 41 L7 47 Z" fill="#9a6232"/>' +
  '<rect x="23" y="39" width="5" height="9" rx="1.5" fill="#7a4a24"/>' +
  '<rect x="20" y="28" width="24" height="11" rx="3" fill="#c98a4b"/>' +
  '<rect x="43" y="30.5" width="17" height="5" rx="2.5" fill="#8b93a3"/>' +
  '<rect x="57" y="29.5" width="4" height="7" rx="1.5" fill="#4b5363"/>' +
  '<rect x="30" y="24.5" width="3" height="4" fill="#4b5363"/>' +
  '<rect x="26" y="19.5" width="15" height="6" rx="3" fill="#6b7a99"/>' +
  '<path d="M27 39 Q31 47 36 39" fill="none"/>' +
  '</g></svg>';

/** Icône dessinée des Gardiens : trois orbes lumineux qui tournent sur une orbite autour du héros. */
const ORBS_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true">' +
  '<defs><radialGradient id="orb-glow" cx="35%" cy="30%" r="75%">' +
  '<stop offset="0" stop-color="#eafcff"/><stop offset="0.45" stop-color="#6fe9ff"/><stop offset="1" stop-color="#1e9fd0"/>' +
  '</radialGradient></defs>' +
  '<circle cx="32" cy="32" r="21" fill="none" stroke="#2a2f55" stroke-opacity="0.35" stroke-width="2.5" stroke-dasharray="3 4"/>' +
  '<circle cx="32" cy="32" r="5" fill="#ffe14d" stroke="#2a2f55" stroke-width="2"/>' +
  '<g stroke="#1b4a66" stroke-width="2.5">' +
  '<circle cx="53" cy="32" r="8" fill="url(#orb-glow)"/>' +
  '<circle cx="21.5" cy="50.2" r="8" fill="url(#orb-glow)"/>' +
  '<circle cx="21.5" cy="13.8" r="8" fill="url(#orb-glow)"/>' +
  '</g>' +
  '<g fill="#fff" opacity="0.85">' +
  '<circle cx="50.5" cy="29.5" r="2.2"/><circle cx="19" cy="47.7" r="2.2"/><circle cx="19" cy="11.3" r="2.2"/>' +
  '</g></svg>';

/** Icône dessinée des Mines : une bombe hérissée de pointes, avec sa mèche et son voyant rouge. */
const MINES_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true">' +
  '<defs><radialGradient id="mine-body" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#8a93a8"/><stop offset="1" stop-color="#2f3547"/></radialGradient></defs>' +
  '<g stroke="#161a2a" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">' +
  '<path d="M49 38h8M44 50l5 5M32 55v6M20 50l-5 5M15 38H7M20 26l-5-5M44 26l5-5" fill="none" stroke-width="4"/>' +
  '<circle cx="32" cy="38" r="17" fill="url(#mine-body)"/>' +
  '<path d="M32 21q3-8 11-9" fill="none" stroke="#c9a06a" stroke-width="3"/>' +
  '<circle cx="32" cy="38" r="6" fill="#ff4d3a"/>' +
  '</g>' +
  '<path d="M45 6l1.6 3.8 3.9.4-3 2.6.9 3.9-3.4-2-3.4 2 .9-3.9-3-2.6 3.9-.4z" fill="#ffd84d" stroke="#b8760f" stroke-width="1"/>' +
  '<ellipse cx="25" cy="31" rx="4" ry="2.5" fill="#fff" opacity="0.5" transform="rotate(-30 25 31)"/>' +
  '</svg>';

/** Pour ajouter une arme : une entrée ici, son comportement dans `src/weapons.ts`. */
export const WEAPONS: WeaponDef[] = [
  {
    id: 'rifle',
    icon: RIFLE_ICON,
    name: 'Carabine',
    desc: 'Tire sur l’ennemi le plus proche',
    cost: 0,
    levels: [
      lv('Tire sur l’ennemi le plus proche', 1, 0.55, 1, 0, 0),
      lv('+1 projectile', 1, 0.55, 2, 0, 0),
      lv('+35 % de dégâts', 1.35, 0.55, 2, 0, 0),
      lv('Tire 25 % plus vite', 1.35, 0.41, 2, 0, 0),
      lv('Les tirs traversent 1 ennemi', 1.35, 0.41, 2, 1, 0),
      lv('+1 projectile', 1.35, 0.41, 3, 1, 0),
    ],
  },
  {
    id: 'orbs',
    icon: ORBS_ICON,
    name: 'Gardiens',
    desc: 'Des orbes tournent autour de vous',
    cost: 400,
    levels: [
      lv('Des orbes tournent autour de vous', 0.8, 0.4, 2, 0, 2.4),
      lv('+1 orbe', 0.8, 0.4, 3, 0, 2.4),
      lv('+30 % de dégâts', 1.05, 0.4, 3, 0, 2.4),
      lv('Orbite plus large', 1.05, 0.4, 3, 0, 3.2),
      lv('+1 orbe', 1.05, 0.4, 4, 0, 3.2),
      lv('+1 orbe, frappent 2 fois plus souvent', 1.05, 0.2, 5, 0, 3.2),
    ],
  },
  {
    id: 'aura',
    icon: '🔥',
    name: 'Aura ardente',
    desc: 'Brûle tout ce qui s’approche',
    cost: 1200,
    levels: [
      lv('Brûle tout ce qui s’approche', 0.7, 0.9, 1, 0, 3),
      lv('+20 % de rayon', 0.7, 0.9, 1, 0, 3.6),
      lv('Pulse 25 % plus vite', 0.7, 0.68, 1, 0, 3.6),
      lv('+40 % de dégâts', 1, 0.68, 1, 0, 3.6),
      lv('+25 % de rayon', 1, 0.68, 1, 0, 4.5),
      lv('Pulse 40 % plus vite', 1, 0.41, 1, 0, 4.5),
    ],
  },
  {
    id: 'spear',
    icon: '🔱',
    name: 'Lance',
    desc: 'Transperce toute une ligne d’ennemis',
    cost: 3000,
    levels: [
      lv('Transperce toute une ligne d’ennemis', 2.4, 1.3, 1, 99, 0.5),
      lv('+30 % de dégâts', 3.1, 1.3, 1, 99, 0.5),
      lv('Lance 25 % plus vite', 3.1, 0.98, 1, 99, 0.5),
      lv('+1 lance', 3.1, 0.98, 2, 99, 0.5),
      lv('Lances plus larges', 3.1, 0.98, 2, 99, 0.8),
      lv('+1 lance et +30 % de dégâts', 4, 0.98, 3, 99, 0.8),
    ],
  },
  // Arme secrète des coffres : elle ne tire pas, elle sème des pièges (il faut bouger pour les placer).
  // Réglée pour être 10 à 20 % plus forte que la carabine et la lance (dégâts × nombre / délai, niveau par niveau).
  {
    id: 'mines',
    icon: MINES_ICON,
    name: 'Mines',
    desc: 'Sème des pièges en marchant : ils explosent au passage des ennemis',
    cost: 0,
    chest: true,
    levels: [
      lv('Sème des mines en marchant : elles explosent au passage des ennemis', 3.4, 1.6, 1, 0, 2.6),
      lv('+1 mine à chaque pose', 3.4, 1.6, 2, 0, 2.6),
      lv('+25 % de dégâts', 4.25, 1.6, 2, 0, 2.6),
      lv('Explosions plus larges', 4.25, 1.6, 2, 0, 3.4),
      lv('Pose 30 % plus vite', 4.25, 1.1, 2, 0, 3.4),
      lv('+1 mine et +20 % de dégâts', 5.1, 1.1, 3, 0, 3.4),
    ],
  },
];

export const DEFAULT_WEAPON = 'rifle';

export function weaponDef(id: string): WeaponDef | undefined {
  return WEAPONS.find((w) => w.id === id);
}
