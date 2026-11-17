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
    cost: 120,
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
    cost: 200,
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
    cost: 300,
    levels: [
      lv('Transperce toute une ligne d’ennemis', 2.4, 1.3, 1, 99, 0.5),
      lv('+30 % de dégâts', 3.1, 1.3, 1, 99, 0.5),
      lv('Lance 25 % plus vite', 3.1, 0.98, 1, 99, 0.5),
      lv('+1 lance', 3.1, 0.98, 2, 99, 0.5),
      lv('Lances plus larges', 3.1, 0.98, 2, 99, 0.8),
      lv('+1 lance et +30 % de dégâts', 4, 0.98, 3, 99, 0.8),
    ],
  },
];

export const DEFAULT_WEAPON = 'rifle';

export function weaponDef(id: string): WeaponDef | undefined {
  return WEAPONS.find((w) => w.id === id);
}
