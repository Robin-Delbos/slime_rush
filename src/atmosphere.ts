/**
 * Ambiance du ciel et de la lumière, selon la difficulté : plus c'est dur, plus le jour décline.
 * Données pures (couleurs en 0xRRGGBB) ; `World.setAtmosphere` les applique à la scène.
 */
export interface Atmosphere {
  /** Haut et bas du dégradé de ciel. */
  skyTop: number;
  skyBottom: number;
  /** Brume lointaine (proche de la couleur de l'horizon). */
  fog: number;
  /** Soleil : couleur et intensité. */
  sun: number;
  sunIntensity: number;
  /** Lumière ambiante : ciel, sol et intensité. */
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
}

export const ATMOSPHERES: Record<string, Atmosphere> = {
  // Matin clair et frais.
  easy: { skyTop: 0x4ea8ff, skyBottom: 0xd2f0ff, fog: 0xd2f0ff, sun: 0xfff6e0, sunIntensity: 2.0, hemiSky: 0xffffff, hemiGround: 0x8ad063, hemiIntensity: 1.2 },
  // Après-midi doré.
  normal: { skyTop: 0x5f9fe6, skyBottom: 0xffe0b0, fog: 0xf6dcb4, sun: 0xffe0a8, sunIntensity: 2.1, hemiSky: 0xfff2dc, hemiGround: 0x86c45a, hemiIntensity: 1.15 },
  // Coucher de soleil.
  hard: { skyTop: 0x5c4f9e, skyBottom: 0xffae78, fog: 0xf0a37e, sun: 0xffa86a, sunIntensity: 1.95, hemiSky: 0xffd9c4, hemiGround: 0x7f9650, hemiIntensity: 1.1 },
  // Crépuscule rouge.
  extreme: { skyTop: 0x2a1c4c, skyBottom: 0xd8584a, fog: 0xa4505a, sun: 0xff7a55, sunIntensity: 1.7, hemiSky: 0xe0a8b4, hemiGround: 0x62703f, hemiIntensity: 1.05 },
};

export const DEFAULT_ATMOSPHERE = 'normal';

/** Ambiance d'une difficulté, ou l'ambiance normale si l'identifiant est inconnu. */
export function atmosphereFor(difficultyId: string): Atmosphere {
  return ATMOSPHERES[difficultyId] ?? ATMOSPHERES[DEFAULT_ATMOSPHERE];
}
