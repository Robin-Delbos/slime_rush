import threeLicenseText from '../node_modules/three/LICENSE?raw';

/** Une ressource tierce utilisée par le jeu, et la licence qui permet de l'utiliser. */
export interface Credit {
  /** Ce que c'est, côté jeu. */
  what: string;
  /** Nom de l'œuvre ou du logiciel, et de ses auteurs. */
  name: string;
  /** Mention d'auteur à afficher telle quelle. */
  author: string;
  license: string;
  licenseUrl?: string;
  sourceUrl?: string;
  sourceLabel?: string;
}

/**
 * Tout ce que le jeu emprunte à d'autres. La licence CC BY 4.0 (icônes) et la licence MIT (three.js) exigent que la
 * mention soit visible dans le jeu publié, pas seulement dans le dépôt : cette liste est affichée à l'écran « Crédits et licences ».
 * Une nouvelle ressource tierce (modèle, police, bibliothèque...) s'ajoute ici.
 */
export const CREDITS: Credit[] = [
  {
    what: 'Héros et ennemis (modèles 3D)',
    name: 'Quaternius',
    author: 'Modèles créés par Quaternius',
    license: 'CC0 1.0 (domaine public)',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceUrl: 'https://poly.pizza/u/Quaternius',
    sourceLabel: 'poly.pizza/u/Quaternius',
  },
  {
    what: 'Icônes (pièce, cadeau, crâne...)',
    name: 'Twemoji',
    author: 'Copyright Twitter, Inc. et autres contributeurs',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    sourceUrl: 'https://github.com/jdecked/twemoji',
    sourceLabel: 'github.com/jdecked/twemoji',
  },
  {
    what: 'Moteur 3D',
    name: 'three.js',
    author: 'Copyright les auteurs de three.js',
    license: 'MIT (texte complet ci-dessous)',
    licenseUrl: 'https://opensource.org/license/mit',
    sourceUrl: 'https://threejs.org',
    sourceLabel: 'threejs.org',
  },
  {
    what: 'Musiques et bruitages',
    name: 'Créés pour le jeu',
    author: 'Synthétisés dans le navigateur, sans aucun fichier audio',
    license: 'Œuvre originale',
  },
];

/** Texte complet de la licence de three.js, lu dans la bibliothèque installée : il suit donc sa version. */
export const THREE_LICENSE: string = threeLicenseText.trim();
