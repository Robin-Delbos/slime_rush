/**
 * Déroulé de l'ouverture des coffres en plein écran : pour chaque coffre, la tension (il tremble), l'éclat
 * (il s'ouvre), puis la carte du contenu ; après le dernier, un récapitulatif (si plusieurs coffres) et le choix
 * d'en ouvrir d'autres. Logique pure, sans affichage : l'interface s'en sert pour savoir où on en est et ce
 * qu'un toucher doit faire.
 */

export type RevealPhase =
  /** Le coffre tremble ; un toucher l'ouvre tout de suite. */
  | 'tension'
  /** L'éclat : le coffre s'ouvre. */
  | 'burst'
  /** La carte vient d'apparaître : trop tôt pour passer à la suite (on la laisse admirer un instant). */
  | 'card'
  /** La carte peut être quittée d'un toucher. */
  | 'card-ready'
  /** Récapitulatif des contenus, après plusieurs coffres. */
  | 'recap'
  /** Fin : les boutons « Encore » et « Terminer » sont proposés. */
  | 'end';

export type RevealAdvance = 'chest' | 'recap' | null;

/** Durées (ms) des étapes. */
export const REVEAL_TIMING = {
  /** Instant où le coffre touche le sol (impact, puis début du grondement). */
  impact: 500,
  /** Tension avant l'ouverture automatique : la chute, puis un grondement d'environ une seconde. */
  tension: 1550,
  /** Éclat avant l'apparition de la carte. */
  burst: 480,
  /** Temps pendant lequel on ne peut pas encore passer la carte. */
  admire: 800,
};

export class RevealFlow {
  index = 0;
  phase: RevealPhase = 'tension';

  constructor(readonly total: number) {}

  get isLast(): boolean {
    return this.index === this.total - 1;
  }

  /** « 2 / 3 », ou vide pour un coffre unique. */
  get counter(): string {
    return this.total > 1 ? `${this.index + 1} / ${this.total}` : '';
  }

  /** Un toucher pendant la tension ouvre le coffre sans attendre. Renvoie false si ce n'était pas le moment. */
  openNow(): boolean {
    if (this.phase !== 'tension') return false;
    this.phase = 'burst';
    return true;
  }

  /** L'éclat est passé : la carte apparaît. */
  showCard(): boolean {
    if (this.phase !== 'burst') return false;
    this.phase = 'card';
    return true;
  }

  /**
   * La carte a été assez regardée. Pour un coffre unique, on passe directement à la fin (boutons proposés) ;
   * sinon un toucher fera passer à la suite.
   */
  makeReady(): boolean {
    if (this.phase !== 'card') return false;
    this.phase = this.total === 1 ? 'end' : 'card-ready';
    return true;
  }

  /** Un toucher sur une carte prête : coffre suivant, ou récapitulatif après le dernier. */
  advance(): RevealAdvance {
    if (this.phase !== 'card-ready') return null;
    if (!this.isLast) {
      this.index++;
      this.phase = 'tension';
      return 'chest';
    }
    this.phase = 'recap';
    return 'recap';
  }

  /** Le récapitulatif est affiché : les boutons de fin sont proposés. */
  finish(): boolean {
    if (this.phase !== 'recap') return false;
    this.phase = 'end';
    return true;
  }
}
