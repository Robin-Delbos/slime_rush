/**
 * Qualité d'affichage automatique, sans réglage pour le joueur (sans DOM, testable sous Node).
 *
 * Le jeu fait chauffer l'appareil et vide la batterie s'il dessine le plus d'images et de pixels possible. On limite donc :
 * - la fréquence d'images (30 par seconde sur mobile, 60 sur PC, même sur un écran à 90, 120 ou 144 Hz) ;
 * - la résolution, qui s'ajuste toute seule selon le temps d'image mesuré (`ResolutionScaler`) ;
 * - les ombres (seul le héros projette une ombre portée, les ennemis gardent leur disque d'ombre) ;
 * - l'anticrénelage, inutile sur les écrans à haute densité.
 */

export interface Quality {
  /** Images dessinées au plus par seconde pendant le jeu et au menu. */
  maxFps: number;
  /** Images par seconde au menu principal : le héros ne fait que respirer, inutile d'aller aussi vite qu'en partie. */
  menuFps: number;
  /** Images par seconde quand la scène est figée (pause, choix de niveau) : rien ne bouge, inutile de la redessiner à fond. */
  frozenFps: number;
  /** Résolution de départ et maximale (pixels dessinés par pixel CSS). */
  maxPixelRatio: number;
  /** Résolution plancher de l'ajustement automatique. */
  minPixelRatio: number;
  antialias: boolean;
  /** Côté de la carte d'ombres, en pixels. */
  shadowMapSize: number;
  /** Filtrage anisotrope du sol (netteté vue de biais, au prix de la bande passante mémoire). */
  anisotropy: number;
}

export interface DeviceInfo {
  mobile: boolean;
  devicePixelRatio: number;
}

/** Téléphone ou tablette (pointeur principal tactile, ou identité mobile). */
export function isMobileDevice(userAgent: string, coarsePointer: boolean): boolean {
  return coarsePointer || /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

/** Résolution la plus basse que l'ajustement automatique peut atteindre : en dessous, l'image serait trop floue. */
export const MIN_PIXEL_RATIO = 0.75;

export function qualityFor(device: DeviceInfo): Quality {
  const dpr = Math.max(1, device.devicePixelRatio || 1);
  return {
    maxFps: device.mobile ? 30 : 60,
    menuFps: device.mobile ? 20 : 30,
    frozenFps: 10,
    // Un téléphone à densité 3 dessinerait 9 pixels par pixel CSS : 1,5 est largement net pour un décor cartoon.
    maxPixelRatio: Math.min(dpr, device.mobile ? 1.5 : 2),
    minPixelRatio: MIN_PIXEL_RATIO,
    // Le crénelage ne se voit plus à haute densité ; l'anticrénelage coûte de la mémoire et de la bande passante.
    antialias: dpr < 1.5,
    shadowMapSize: device.mobile ? 1024 : 2048,
    // Le sol est un damier doux : peu de détail à préserver de biais.
    anisotropy: device.mobile ? 2 : 4,
  };
}

/** Marge sur l'heure d'une image : un écran donne ses tops avec un peu de gigue (en millisecondes). */
const FRAME_SLACK = 2;

/**
 * Plafonne la fréquence de dessin : appelé à chaque top de l'écran, dit s'il faut dessiner cette fois.
 * Les échéances avancent d'un pas régulier (sans dériver), donc 30 images/s sur un écran à 60 Hz en dessine une sur deux,
 * et 60 sur un écran à 144 Hz reste proche de 60.
 */
export class FrameLimiter {
  private next = 0;
  private interval: number;

  constructor(public fps: number) {
    this.interval = 1000 / fps;
  }

  setFps(fps: number): void {
    this.fps = fps;
    this.interval = 1000 / fps;
    // La prochaine échéance de l'ancienne cadence ne vaut plus rien (surtout après 10 images/s).
    this.next = 0;
  }

  shouldRender(now: number): boolean {
    if (now + FRAME_SLACK < this.next) return false;
    // Une longue pause (onglet caché, chargement) : on repart d'ici au lieu de rattraper le retard par rafales.
    this.next = now - this.next > this.interval ? now + this.interval : this.next + this.interval;
    return true;
  }
}

/** Nombre d'images mesurées avant de décider. */
const WINDOW = 20;
/** Au-delà de ce rapport au temps visé, la fenêtre est « trop lente » : on baisse la résolution. */
const SLOW = 1.3;
/** En deçà, elle est « tenue » : on peut essayer de remonter la résolution. */
const STEADY = 1.1;
/** Fenêtres tenues d'affilée avant d'essayer de remonter (à 30 images/s, environ 5 secondes). */
const BASE_STABLE_WINDOWS = 8;
const MAX_STABLE_WINDOWS = 64;
const STEP_DOWN = 0.85;
const STEP_UP = 1.12;

/**
 * Ajuste la résolution selon le temps d'image mesuré : trop lent → on baisse ; tenu longtemps → on remonte, prudemment.
 * Si une remontée fait aussitôt rechuter, la patience avant la suivante double (sinon la résolution oscillerait, et
 * chaque changement coûte un à-coup).
 */
export class ResolutionScaler {
  ratio: number;
  private sum = 0;
  private count = 0;
  private steadyWindows = 0;
  private needSteady = BASE_STABLE_WINDOWS;
  private lastMove: 'up' | 'down' | null = null;

  /**
   * @param min résolution plancher
   * @param max résolution de départ et plafond
   * @param targetMs durée visée d'une image, en millisecondes (1000 / fréquence plafonnée)
   */
  constructor(
    private min: number,
    private max: number,
    private targetMs: number,
  ) {
    this.min = Math.min(min, max);
    this.ratio = max;
  }

  /** Une nouvelle cadence visée (la mesure en cours ne vaut plus). */
  setTarget(targetMs: number): void {
    this.targetMs = targetMs;
    this.sum = 0;
    this.count = 0;
    this.steadyWindows = 0;
  }

  /** Enregistre le temps écoulé depuis l'image précédente. Renvoie la nouvelle résolution si elle change, sinon null. */
  record(frameMs: number): number | null {
    // Un à-coup isolé (ramasse-miettes, notification) ne doit pas faire baisser la résolution.
    this.sum += Math.min(frameMs, this.targetMs * 3);
    if (++this.count < WINDOW) return null;
    const average = this.sum / this.count;
    this.sum = 0;
    this.count = 0;

    if (average > this.targetMs * SLOW) {
      this.steadyWindows = 0;
      if (this.lastMove === 'up') this.needSteady = Math.min(this.needSteady * 2, MAX_STABLE_WINDOWS);
      this.lastMove = 'down';
      return this.moveTo(this.ratio * STEP_DOWN);
    }
    if (average <= this.targetMs * STEADY) {
      if (this.ratio >= this.max) {
        // Plein régime depuis un moment : l'historique des rechutes est oublié.
        this.needSteady = BASE_STABLE_WINDOWS;
        return null;
      }
      if (++this.steadyWindows >= this.needSteady) {
        this.steadyWindows = 0;
        this.lastMove = 'up';
        return this.moveTo(this.ratio * STEP_UP);
      }
      return null;
    }
    // Entre les deux : ni assez lent pour baisser, ni assez tenu pour remonter.
    this.steadyWindows = 0;
    return null;
  }

  private moveTo(wanted: number): number | null {
    // Par pas de 0,05 : deux résolutions presque égales ne justifient pas de réallouer l'image.
    const next = Math.min(this.max, Math.max(this.min, Math.round(wanted * 20) / 20));
    if (next === this.ratio) return null;
    this.ratio = next;
    return next;
  }
}
