/**
 * Journal des nouveautés, affiché dans le jeu quand on touche la version au menu.
 *
 * On n'y met que ce qui sert au joueur : contenu, règles, confort de jeu, défauts corrigés. Pas de refonte du code, de test
 * ni d'outil. Jamais un mot sur le niveau 100 (mode Légende, trophée) : c'est un easter egg. Chaque nouvelle version de `package.json` y ajoute son entrée EN PREMIER (un test vérifie qu'elle existe).
 */

/** `new` : nouveauté ; `change` : une règle ou un réglage qui change ; `fix` : un défaut corrigé. */
export type ChangeKind = 'new' | 'change' | 'fix';

export interface Change {
  kind: ChangeKind;
  text: string;
}

export interface Release {
  /** Numéro `x.y.z`, celui de `package.json`. */
  version: string;
  /** Jour de la publication, `AAAA-MM-JJ`. */
  date: string;
  changes: Change[];
}

export const CHANGE_LABELS: Record<ChangeKind, string> = { new: 'Nouveau', change: 'Changé', fix: 'Corrigé' };

const n = (text: string): Change => ({ kind: 'new', text });
const c = (text: string): Change => ({ kind: 'change', text });
const f = (text: string): Change => ({ kind: 'fix', text });

/** Du plus récent au plus ancien. */
export const CHANGELOG: Release[] = [
  {
    version: '0.9.1',
    date: '2026-11-24',
    changes: [c('Écran des amulettes : le bouton « − » d’une amulette au niveau 1 la retire, comme le bouton « Retirer ».')],
  },
  {
    version: '0.9.0',
    date: '2026-11-23',
    changes: [
      n('Journal des nouveautés : touchez le numéro de version au menu pour voir ce qui a changé.'),
      c('Écran des héros : trois héros par ligne au maximum, sur tous les écrans, pour des cadres plus grands et plus lisibles.'),
      n('Une amulette équipée se voit au menu (icône et niveau) ; la toucher ouvre la collection sur les amulettes.'),
      c('Joystick plus réactif : le héros va toujours à pleine vitesse (plus de marche lente), et le joystick suit le doigt, donc changer de direction est immédiat.'),
      c('Les ennemis peuvent maintenant surgir juste derrière la clôture, près d’un héros collé à un bord ou dans un coin (toujours à l’extérieur de la clôture) : rester dans un coin n’est plus sûr. Les boss, eux, restent loin.'),
      c('Un boss rapporte plus : 99 XP et 99 pièces en mourant (au lieu de 36 XP et 42 pièces).'),
      c('L’annonce de boss est plus petite sur téléphone à l’horizontale.'),
      n('Le nombre de pièces est aussi affiché dans la collection, pour savoir ce qu’on peut acheter à l’écran des héros.'),
      f('Le héros ne disparaît plus du menu ni de l’aperçu des héros après une partie perdue en plein clignotement.'),
    ],
  },
  {
    version: '0.8.1',
    date: '2026-11-21',
    changes: [
      c('Téléphone à l’horizontale : le menu, la pause, le choix de niveau, la fin de partie, la boutique et la collection tiennent à l’écran sans barre de défilement.'),
      c('Le pied du menu (version, crédits, installation) est tout en bas de l’écran.'),
      f('Fermer la politique de confidentialité depuis l’application installée ne ferme plus l’application : elle s’ouvre maintenant dans le jeu.'),
    ],
  },
  {
    version: '0.8.0',
    date: '2026-11-21',
    changes: [
      n('Bouton plein écran sur Android et iPad, avec l’horizontal verrouillé tant que dure le plein écran (Android).'),
      n('Message « Tournez votre téléphone » sur téléphone et tablette tenus à la verticale ; « Jouer quand même à la verticale » reste possible.'),
      n('Le jeu s’installe comme une vraie application sur Android et iPhone (lien « Installer l’application » au menu).'),
      n('Bandeau « Nouvelle version disponible » avec le bouton Actualiser, au menu et en fin de partie.'),
      n('Jeu à deux mains sur mobile : un doigt déplace le héros, un deuxième appui bref lance l’attaque spéciale.'),
      c('Le téléphone et l’ordinateur chauffent et consomment moins : 30 images par seconde sur mobile, 60 sur PC, résolution ajustée automatiquement.'),
      c('Les ennemis, boss compris, apparaissent à l’extérieur de la clôture, jamais près du héros : le début de partie est un peu plus calme.'),
    ],
  },
  {
    version: '0.7.1',
    date: '2026-11-19',
    changes: [f('Au menu, toutes les armes restent sur une seule ligne, à la taille de l’écran.')],
  },
  {
    version: '0.7.0',
    date: '2026-11-18',
    changes: [
      n('Probabilités du contenu des coffres, derrière la petite icône « i » de la boutique.'),
      n('Écran « Crédits et licences » et politique de confidentialité, accessibles depuis le menu.'),
    ],
  },
  {
    version: '0.6.0',
    date: '2026-11-18',
    changes: [
      n('Deux héros se trouvent désormais seulement dans les coffres, et un coffre ne donne jamais deux fois le même.'),
      n('Rareté mythique pour l’arme secrète des coffres, avec son et effets à part.'),
      n('Musique dédiée à l’ouverture des coffres.'),
      c('Les prix des héros sont réajustés.'),
      f('Sur mobile, les quatre difficultés sont bien alignées.'),
      f('Sur mobile, le sol ne disparaît plus dans l’aperçu d’un héros.'),
    ],
  },
  {
    version: '0.5.0',
    date: '2026-11-18',
    changes: [
      n('Le menu se partage en Boutique (améliorations, coffres) et Collection (héros, apparences, amulettes), à onglets.'),
      n('Cinq nouveaux héros : Anne, Sam, Pirate, Lis et Matt. On les voit en entier, qui pivotent, avant de les acheter.'),
      n('La pause propose les boutons Son et Musique.'),
      c('Chaque catégorie d’apparences est expliquée, avec les armes concernées.'),
      c('Sur écran étroit, la barre du haut passe sur deux lignes sans rien chevaucher.'),
    ],
  },
  {
    version: '0.4.0',
    date: '2026-11-18',
    changes: [
      n('Musique de fond : menu, partie et boss, atténuée en pause et coupée en arrière-plan.'),
      n('Bruit de pas discret, et chute du coffre plus marquée.'),
      f('Les icônes sont identiques sur tous les appareils (la pièce paraissait grise sur iPhone).'),
      f('Le son fonctionne aussi sur les anciens Safari.'),
    ],
  },
  {
    version: '0.3.0',
    date: '2026-11-17',
    changes: [
      n('Ouverture des coffres en plein écran : le coffre tombe, tremble, éclate, puis révèle sa carte. Plusieurs coffres s’enchaînent, avec un récapitulatif et un bouton « Encore ».'),
      c('Les mines ne se posent plus qu’en marchant : rester sur place ne suffit plus à tout éliminer.'),
      c('Prix rééquilibrés : améliorations de Vitalité et de Puissance, armes et apparences.'),
    ],
  },
  {
    version: '0.2.0',
    date: '2026-11-17',
    changes: [
      n('Coffres à ouvrir depuis le menu : un coffre pour 1 000 pièces, ou trois pour 2 500.'),
      n('Amulettes à effet pour une seule partie, renforcées par les doublons.'),
      n('Apparences à collectionner : couleur des projectiles, traînées et poussière sous les pas.'),
      n('Une arme exclusive aux coffres : les Mines.'),
      n('Le numéro de version s’affiche au menu.'),
      f('À l’horizontale, les écrans de pause, de niveau et de fin ne passent plus sous la barre de vie.'),
    ],
  },
  {
    version: '0.1.0',
    date: '2026-11-17',
    changes: [
      n('Première version jouable : survivre aux vagues d’ennemis, tir automatique, niveaux et attaque spéciale, sur ordinateur et mobile.'),
      n('Une arme au choix pour toute la partie (carabine, gardiens, aura ardente, lance), à débloquer avec l’or gagné.'),
      n('Quatre difficultés, de facile à extrême, avec un multiplicateur d’or.'),
      n('Un boss toutes les deux minutes, de plus en plus nombreux ; chaque niveau rend un peu de vie.'),
      n('Sauvegarde exportable et importable (code à copier ou fichier).'),
    ],
  },
];

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 2026-11-21 » → « 21 novembre 2026 » (sans dépendre de la langue du navigateur). */
export function formatReleaseDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : date;
}
