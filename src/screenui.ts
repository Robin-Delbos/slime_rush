import { FullscreenControl, InstallControl, canRotateByFullscreen, fullscreenMode, installMode, wantsRotateHint, type FullscreenDocument, type FullscreenTarget, type InstallEvent, type OrientationApi, type ScreenEnv } from './screen';

type WebkitDocument = Document & { webkitFullscreenEnabled?: boolean };

/** Lit ce que le navigateur dit de l'appareil et de son écran. */
function readEnvironment(): ScreenEnv {
  const media = (query: string): boolean => window.matchMedia?.(query).matches ?? false;
  const doc = document as WebkitDocument;
  return {
    userAgent: navigator.userAgent,
    coarsePointer: media('(pointer: coarse)'),
    standalone: media('(display-mode: fullscreen)') || media('(display-mode: standalone)') || (navigator as { standalone?: boolean }).standalone === true,
    fullscreenEnabled: !!(doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled),
    portrait: window.innerHeight > window.innerWidth,
    canLockOrientation: typeof screen.orientation?.lock === 'function',
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  };
}

const INSTALL_HINT = 'Pour jouer en plein écran : touchez Partager, puis « Sur l’écran d’accueil », et lancez le jeu depuis son icône.';
const IOS_INSTALL_HINT = 'Pour installer le jeu : touchez Partager, puis « Sur l’écran d’accueil ».';
const HINT_DURATION = 7000;

/**
 * Relie le plein écran et l'invitation à tourner le téléphone à la page.
 * `onRotateHint` est appelé quand l'invitation apparaît (le jeu met alors la partie en pause).
 */
export function setupScreen(onRotateHint: () => void): void {
  const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const menuButton = byId('btn-fullscreen');
  const pauseButton = byId('btn-fullscreen-pause');
  const hint = byId('fullscreen-hint');
  const rotate = byId('overlay-rotate');

  const control = new FullscreenControl(document as FullscreenDocument, document.documentElement as FullscreenTarget, screen.orientation as OrientationApi | undefined);
  let hintTimer = 0;
  let rotateDismissed = false;

  const install = new InstallControl();
  const installButton = byId('btn-install');

  const showHint = (text: string): void => {
    hint.textContent = text;
    hint.classList.remove('hidden');
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => hint.classList.add('hidden'), HINT_DURATION);
  };

  const refreshFullscreen = (): void => {
    const mode = fullscreenMode(readEnvironment());
    const on = control.active;
    menuButton.classList.toggle('hidden', mode === 'none');
    pauseButton.classList.toggle('hidden', mode === 'none');
    menuButton.classList.toggle('on', on);
    menuButton.setAttribute('aria-pressed', String(on));
    pauseButton.setAttribute('aria-pressed', String(on));
    pauseButton.textContent = mode === 'toggle' ? `Plein écran : ${on ? 'oui' : 'non'}` : 'Plein écran';
  };

  const rotateFullscreen = byId('btn-rotate-fullscreen');
  const refreshRotate = (): void => {
    const env = readEnvironment();
    const shown = wantsRotateHint(env, rotateDismissed);
    // Le bouton « Plein écran » de l'invitation verrouille l'horizontal : le téléphone tourne tout seul.
    rotateFullscreen.classList.toggle('hidden', !canRotateByFullscreen(env));
    const wasShown = !rotate.classList.contains('hidden');
    rotate.classList.toggle('hidden', !shown);
    if (shown && !wasShown) onRotateHint();
  };

  const press = (): void => {
    if (fullscreenMode(readEnvironment()) === 'install') showHint(INSTALL_HINT);
    else void control.toggle();
  };
  menuButton.addEventListener('click', press);
  pauseButton.addEventListener('click', press);
  rotateFullscreen.addEventListener('click', () => {
    if (!control.active) void control.toggle();
  });
  byId('btn-rotate-skip').addEventListener('click', () => {
    rotateDismissed = true;
    refreshRotate();
  });

  const refreshInstall = (): void => {
    installButton.classList.toggle('hidden', installMode(readEnvironment(), install.available) === 'none');
  };
  installButton.addEventListener('click', () => {
    if (installMode(readEnvironment(), install.available) === 'prompt') void install.install();
    else showHint(IOS_INSTALL_HINT);
  });
  // Chrome (Android) propose l'installation par cet événement ; on garde la proposition pour notre bouton
  // (sinon il affiche sa propre bannière, au mauvais moment).
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    install.capture(event as unknown as InstallEvent);
  });
  window.addEventListener('appinstalled', () => install.installed());
  install.onChange = refreshInstall;

  control.onChange = refreshFullscreen;
  // Le téléphone qu'on tourne change la taille de la fenêtre.
  window.addEventListener('resize', refreshRotate);
  window.addEventListener('orientationchange', refreshRotate);
  refreshFullscreen();
  refreshRotate();
  refreshInstall();
}
