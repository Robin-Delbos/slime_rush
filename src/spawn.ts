/**
 * Point d'apparition des ennemis : à l'extérieur de la clôture, jamais dans l'arène (sans affichage, testable sous Node).
 *
 * On tire une direction autour du héros et on suit ce rayon jusqu'à sortir du carré de demi-côté `half` (la clôture, élargie
 * du rayon de l'ennemi pour qu'il soit entièrement dehors). Les ennemis arrivent ainsi de tous côtés, et plus souvent du côté
 * le plus proche du héros quand il longe un bord.
 */

/**
 * Distance minimale au héros pour les ennemis ordinaires. Elle est courte à dessein : un héros collé à un bord ou dans un coin voit
 * des ennemis surgir juste derrière la clôture, au lieu de les attendre en file venue de l'autre bout de l'arène (le camping dans
 * un coin était trop sûr). Au centre de l'arène, la clôture est à plus de 40 unités : rien n'y change.
 */
export const MIN_SPAWN_DISTANCE = 3;

/** Distance minimale au héros pour les boss : plus longue, leurs attaques annoncées demandent le temps de réagir. */
export const BOSS_SPAWN_DISTANCE = 26;

/** Nombre de directions tirées avant le repli (héros collé à un bord : une bonne partie des directions donne un point trop proche). */
const ATTEMPTS = 8;
/** Écart maximal, en radians, de la direction de repli autour de la direction du centre de l'arène. */
const FALLBACK_SPREAD = 1.2;

export interface Point {
  x: number;
  z: number;
}

/** Point où le rayon parti de (px, pz) dans la direction `angle` sort du carré centré sur l'origine, de demi-côté `half`. */
export function squareExit(px: number, pz: number, angle: number, half: number): Point {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  // Distance jusqu'à chaque côté atteignable ; la plus courte est celle où l'on sort.
  const tx = dx > 1e-12 ? (half - px) / dx : dx < -1e-12 ? (-half - px) / dx : Infinity;
  const tz = dz > 1e-12 ? (half - pz) / dz : dz < -1e-12 ? (-half - pz) / dz : Infinity;
  // Un héros déjà hors du carré (ne devrait pas arriver) : on part de là où il est.
  const t = Math.max(0, Math.min(tx, tz));
  return { x: px + dx * t, z: pz + dz * t };
}

/**
 * Point d'apparition hors du carré de demi-côté `half`, à au moins `minDistance` du héros.
 * Quelques directions sont tirées au hasard ; si aucune ne donne un point assez loin (héros collé à un bord ou dans un coin),
 * on part du côté opposé : une direction vers le centre de l'arène, légèrement écartée au hasard, sort toujours très loin.
 * @param nextAngle tire une direction en radians, entre 0 et 2π ; l'aléatoire du jeu y est branché pour rester reproductible
 */
export function spawnOutside(px: number, pz: number, half: number, nextAngle: () => number, minDistance = MIN_SPAWN_DISTANCE): Point {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const point = squareExit(px, pz, nextAngle(), half);
    if (Math.hypot(point.x - px, point.z - pz) >= minDistance) return point;
  }
  const towardCenter = Math.atan2(-pz, -px);
  return squareExit(px, pz, towardCenter + (nextAngle() / (2 * Math.PI) - 0.5) * FALLBACK_SPREAD, half);
}
