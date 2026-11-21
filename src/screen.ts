/**
 * Plein écran et orientation sur mobile, sans accès au DOM (testable sous Node).
 *
 * - Android et iPad : l'API plein écran masque les barres du navigateur, et l'horizontal peut être verrouillé
 *   (le verrouillage n'est accepté que pendant le plein écran).
 * - iPhone : ni plein écran ni verrouillage ne sont permis par Apple. Le plein écran passe par l'installation sur
 *   l'écran d'accueil (voir manifest.webmanifest), et le jeu invite à tourner le téléphone.
 */

/** Ce que le navigateur dit de l'appareil, lu une fois par `readEnvironment` (src/screenui.ts). */
export interface ScreenEnv {
  userAgent: string;
  /** Pointeur principal tactile (téléphone, tablette). */
  coarsePointer: boolean;
  /** Jeu lancé depuis l'écran d'accueil : il n'a déjà aucune barre de navigateur. */
  standalone: boolean;
  /** Le navigateur autorise le plein écran sur cette page. */
  fullscreenEnabled: boolean;
  portrait: boolean;
  /** Le navigateur sait verrouiller l'orientation (Android/Chrome : `screen.orientation.lock`, seulement en plein écran). */
  canLockOrientation: boolean;
  /** Nombre de points de contact de l'écran (un iPad se présente comme un Mac : seul le tactile le distingue). */
  maxTouchPoints: number;
}

/** Ce que le bouton de plein écran doit faire : basculer, expliquer comment installer le jeu, ou ne pas exister. */
export type FullscreenMode = 'toggle' | 'install' | 'none';

export function isIPhone(userAgent: string): boolean {
  // Un iPad récent se présente comme un Mac : il n'est pas concerné (il sait faire du plein écran).
  return /iPhone|iPod/.test(userAgent);
}

export function isIPad(userAgent: string, maxTouchPoints: number): boolean {
  return /iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function isTouchDevice(env: ScreenEnv): boolean {
  return env.coarsePointer || isIPhone(env.userAgent);
}

export function fullscreenMode(env: ScreenEnv): FullscreenMode {
  if (!isTouchDevice(env) || env.standalone) return 'none';
  if (env.fullscreenEnabled) return 'toggle';
  return isIPhone(env.userAgent) ? 'install' : 'none';
}

/**
 * Faut-il demander de tourner l'appareil ? Sur tout téléphone ou tablette (iPhone, iPad, Android) tenu à la verticale, tant
 * que le joueur n'a pas choisi de jouer quand même à la verticale (rotation verrouillée dans le système, par exemple).
 * Le jeu est plus agréable à l'horizontale. Sur Android, le verrouillage en plein écran évite le plus souvent d'en arriver là.
 */
export function wantsRotateHint(env: ScreenEnv, dismissed: boolean): boolean {
  return isTouchDevice(env) && env.portrait && !dismissed;
}

/**
 * L'invitation peut-elle proposer « Plein écran » ? Seulement si le plein écran verrouille l'horizontal (Android) : le
 * téléphone tourne alors tout seul, même quand la rotation automatique est coupée. Ailleurs (iPad), le plein écran ne
 * ferait pas tourner l'écran : le bouton serait trompeur.
 */
export function canRotateByFullscreen(env: ScreenEnv): boolean {
  return fullscreenMode(env) === 'toggle' && env.canLockOrientation;
}

/** Comment installer le jeu comme une application : par la fenêtre du navigateur (Android), à la main (iPhone, iPad), ou pas. */
export type InstallMode = 'prompt' | 'ios' | 'none';

export function installMode(env: ScreenEnv, hasPrompt: boolean): InstallMode {
  // Déjà installé (lancé depuis l'écran d'accueil), ou pas un appareil tactile : rien à proposer.
  if (!isTouchDevice(env) || env.standalone) return 'none';
  if (hasPrompt) return 'prompt';
  // Apple ne permet pas d'installer par du code : on ne peut qu'indiquer le chemin « Partager → Sur l'écran d'accueil ».
  return isIPhone(env.userAgent) || isIPad(env.userAgent, env.maxTouchPoints) ? 'ios' : 'none';
}

/** La proposition d'installation que le navigateur (Chrome, Android) remet à la page : `beforeinstallprompt`. */
export interface InstallEvent {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

/** Garde la proposition d'installation du navigateur et la déclenche quand le joueur appuie sur le bouton. */
export class InstallControl {
  private event: InstallEvent | null = null;
  /** Appelé quand l'installation devient possible ou ne l'est plus. */
  onChange: () => void = () => {};

  get available(): boolean {
    return this.event !== null;
  }

  /** Le navigateur juge le jeu installable (il le dit après le chargement, parfois bien après). */
  capture(event: InstallEvent): void {
    this.event = event;
    this.onChange();
  }

  /** Le jeu vient d'être installé (par ce bouton ou par le menu du navigateur). */
  installed(): void {
    this.event = null;
    this.onChange();
  }

  /** Ouvre la fenêtre d'installation du navigateur. Une proposition ne sert qu'une fois : le navigateur en redonne une au besoin. */
  async install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const event = this.event;
    if (!event) return 'unavailable';
    this.event = null;
    this.onChange();
    try {
      await event.prompt();
      return (await event.userChoice).outcome === 'accepted' ? 'accepted' : 'dismissed';
    } catch {
      return 'dismissed';
    }
  }
}

type Callback = () => void;

/** Le morceau du document que le plein écran utilise (« webkit » : anciens Safari). */
export interface FullscreenDocument {
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?(): Promise<void>;
  webkitExitFullscreen?(): Promise<void> | void;
  addEventListener(type: string, listener: Callback): void;
}

export interface FullscreenTarget {
  requestFullscreen?(options?: { navigationUI: 'hide' }): Promise<void>;
  webkitRequestFullscreen?(): Promise<void> | void;
}

export interface OrientationApi {
  lock?(orientation: 'landscape'): Promise<void>;
  unlock?(): void;
}

/** Entre dans le plein écran et en sort ; verrouille l'horizontal tant qu'il dure. */
export class FullscreenControl {
  /** Appelé à chaque entrée ou sortie du plein écran. */
  onChange: Callback = () => {};

  constructor(
    private doc: FullscreenDocument,
    private target: FullscreenTarget,
    private orientation: OrientationApi | undefined,
  ) {
    // L'utilisateur peut aussi sortir tout seul (geste système, retour) : on suit l'état réel du navigateur.
    const changed = (): void => {
      if (this.active) this.lockLandscape();
      else this.unlockOrientation();
      this.onChange();
    };
    doc.addEventListener('fullscreenchange', changed);
    doc.addEventListener('webkitfullscreenchange', changed);
  }

  get active(): boolean {
    return !!(this.doc.fullscreenElement ?? this.doc.webkitFullscreenElement);
  }

  async toggle(): Promise<void> {
    try {
      if (this.active) {
        await (this.doc.exitFullscreen ?? this.doc.webkitExitFullscreen)?.call(this.doc);
      } else {
        if (this.target.requestFullscreen) await this.target.requestFullscreen({ navigationUI: 'hide' });
        else await this.target.webkitRequestFullscreen?.();
      }
    } catch {
      // Refusé par le navigateur (pas de geste, option désactivée) : le jeu continue comme avant.
    }
  }

  private lockLandscape(): void {
    // Le verrouillage est refusé hors Android/Chrome ou si l'appareil l'interdit : sans importance, le jeu reste jouable.
    try {
      void this.orientation?.lock?.('landscape')?.catch(() => {});
    } catch {
      // lock() peut aussi lever l'erreur tout de suite.
    }
  }

  private unlockOrientation(): void {
    try {
      this.orientation?.unlock?.();
    } catch {
      // Rien à libérer.
    }
  }
}
