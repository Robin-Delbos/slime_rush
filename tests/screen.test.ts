import { describe, expect, it } from 'vitest';
import { FullscreenControl, InstallControl, canRotateByFullscreen, fullscreenMode, installMode, isIPad, isIPhone, wantsRotateHint, type FullscreenDocument, type InstallEvent, type ScreenEnv } from '../src/screen';
import serviceWorker from '../public/sw.js?raw';
import manifestText from '../public/manifest.webmanifest?raw';
import indexHtml from '../index.html?raw';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function env(overrides: Partial<ScreenEnv>): ScreenEnv {
  return { userAgent: ANDROID, coarsePointer: true, standalone: false, fullscreenEnabled: true, portrait: true, canLockOrientation: true, maxTouchPoints: 5, ...overrides };
}

describe('plein écran : quel bouton selon l’appareil', () => {
  it('Android et iPad : le bouton bascule le plein écran', () => {
    expect(fullscreenMode(env({}))).toBe('toggle');
    expect(fullscreenMode(env({ userAgent: IPAD }))).toBe('toggle');
  });

  it('iPhone : Apple interdit le plein écran, le bouton explique l’installation sur l’écran d’accueil', () => {
    expect(fullscreenMode(env({ userAgent: IPHONE, fullscreenEnabled: false }))).toBe('install');
  });

  it('ordinateur : pas de bouton (un PC a déjà F11)', () => {
    expect(fullscreenMode(env({ userAgent: DESKTOP, coarsePointer: false }))).toBe('none');
    expect(fullscreenMode(env({ userAgent: DESKTOP, coarsePointer: false, fullscreenEnabled: false }))).toBe('none');
  });

  it('jeu déjà lancé depuis l’écran d’accueil : rien à proposer', () => {
    expect(fullscreenMode(env({ standalone: true }))).toBe('none');
    expect(fullscreenMode(env({ userAgent: IPHONE, fullscreenEnabled: false, standalone: true }))).toBe('none');
  });

  it('navigateur mobile sans plein écran (hors iPhone) : pas de bouton qui ne ferait rien', () => {
    expect(fullscreenMode(env({ fullscreenEnabled: false }))).toBe('none');
  });

  it('reconnaît l’iPhone mais pas l’iPad, qui se présente comme un Mac', () => {
    expect(isIPhone(IPHONE)).toBe(true);
    expect(isIPhone(IPAD)).toBe(false);
    expect(isIPhone(ANDROID)).toBe(false);
  });
});

describe('invitation à tourner l’appareil', () => {
  const TABLET_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  it('sur tout téléphone ou tablette tenu à la verticale : iPhone, Android, iPad, tablette Android', () => {
    expect(wantsRotateHint(env({ userAgent: IPHONE, portrait: true }), false)).toBe(true);
    expect(wantsRotateHint(env({ userAgent: ANDROID, portrait: true }), false)).toBe(true);
    expect(wantsRotateHint(env({ userAgent: IPAD, portrait: true }), false)).toBe(true);
    expect(wantsRotateHint(env({ userAgent: TABLET_ANDROID, portrait: true }), false)).toBe(true);
  });

  it('jamais à l’horizontale', () => {
    for (const userAgent of [IPHONE, ANDROID, IPAD, TABLET_ANDROID]) {
      expect(wantsRotateHint(env({ userAgent, portrait: false }), false)).toBe(false);
    }
  });

  it('jamais sur ordinateur, même dans une fenêtre étroite et haute', () => {
    expect(wantsRotateHint(env({ userAgent: DESKTOP, coarsePointer: false, maxTouchPoints: 0, portrait: true }), false)).toBe(false);
  });

  it('le joueur peut refuser (rotation verrouillée dans le système) : l’invitation ne revient plus', () => {
    for (const userAgent of [IPHONE, ANDROID, IPAD]) {
      expect(wantsRotateHint(env({ userAgent, portrait: true }), true)).toBe(false);
    }
  });

  it('le bouton « Plein écran » de l’invitation n’existe que là où le plein écran verrouille l’horizontal (Android)', () => {
    expect(canRotateByFullscreen(env({}))).toBe(true);
    // iPad : plein écran possible, mais Safari ne sait pas verrouiller l'orientation : le bouton ne ferait pas tourner l'écran.
    expect(canRotateByFullscreen(env({ userAgent: IPAD, canLockOrientation: false }))).toBe(false);
    // iPhone : pas de plein écran du tout.
    expect(canRotateByFullscreen(env({ userAgent: IPHONE, fullscreenEnabled: false, canLockOrientation: true }))).toBe(false);
    // Android sans verrouillage possible (navigateur ancien), ou déjà installé.
    expect(canRotateByFullscreen(env({ canLockOrientation: false }))).toBe(false);
    expect(canRotateByFullscreen(env({ standalone: true }))).toBe(false);
  });
});

/** Un document factice qui garde l'état du plein écran et enregistre ce qu'on lui demande. */
function fakePage(options: { lockFails?: boolean; requestFails?: boolean; noOrientation?: boolean } = {}) {
  const listeners = new Map<string, () => void>();
  const log: string[] = [];
  const doc: FullscreenDocument & { fullscreenElement: Element | null } = {
    fullscreenElement: null,
    async exitFullscreen() {
      doc.fullscreenElement = null;
      listeners.get('fullscreenchange')?.();
    },
    addEventListener: (type, listener) => void listeners.set(type, listener),
  };
  const target = {
    async requestFullscreen() {
      if (options.requestFails) throw new TypeError('Permissions check failed');
      doc.fullscreenElement = {} as Element;
      listeners.get('fullscreenchange')?.();
    },
  };
  const orientation = options.noOrientation
    ? undefined
    : {
        lock: async (kind: 'landscape') => {
          log.push(`lock ${kind}`);
          if (options.lockFails) throw new DOMException('not supported', 'NotSupportedError');
        },
        unlock: () => void log.push('unlock'),
      };
  return { doc, target, orientation, log, fire: () => listeners.get('fullscreenchange')?.() };
}

describe('plein écran : entrée, sortie et verrouillage de l’horizontal', () => {
  it('entre en plein écran puis verrouille l’horizontal, et libère l’orientation en sortant', async () => {
    const { doc, target, orientation, log } = fakePage();
    const control = new FullscreenControl(doc, target, orientation);
    let changes = 0;
    control.onChange = () => changes++;
    expect(control.active).toBe(false);

    await control.toggle();
    expect(control.active).toBe(true);
    expect(log).toEqual(['lock landscape']);

    await control.toggle();
    expect(control.active).toBe(false);
    expect(log).toEqual(['lock landscape', 'unlock']);
    expect(changes).toBe(2);
  });

  it('suit le navigateur : verrouille quand le plein écran est lancé autrement, libère quand le système en sort', () => {
    const { doc, target, orientation, log, fire } = fakePage();
    const control = new FullscreenControl(doc, target, orientation);
    doc.fullscreenElement = {} as Element;
    fire();
    expect(control.active).toBe(true);
    expect(log).toEqual(['lock landscape']);
    doc.fullscreenElement = null;
    fire();
    expect(control.active).toBe(false);
    expect(log).toEqual(['lock landscape', 'unlock']);
  });

  it('un verrouillage refusé (navigateur ou appareil qui ne sait pas) ne casse rien', async () => {
    const { doc, target, orientation } = fakePage({ lockFails: true });
    const control = new FullscreenControl(doc, target, orientation);
    await control.toggle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(control.active).toBe(true);
  });

  it('sans API d’orientation (iPad, anciens navigateurs), le plein écran marche quand même', async () => {
    const { doc, target } = fakePage({ noOrientation: true });
    const control = new FullscreenControl(doc, target, undefined);
    await control.toggle();
    expect(control.active).toBe(true);
    await control.toggle();
    expect(control.active).toBe(false);
  });

  it('un plein écran refusé par le navigateur laisse le jeu comme il était', async () => {
    const { doc, target, orientation, log } = fakePage({ requestFails: true });
    const control = new FullscreenControl(doc, target, orientation);
    await expect(control.toggle()).resolves.toBeUndefined();
    expect(control.active).toBe(false);
    expect(log).toEqual([]);
  });

  it('suit aussi les anciens Safari (préfixe webkit)', async () => {
    const listeners = new Map<string, () => void>();
    const doc: FullscreenDocument = {
      webkitFullscreenElement: null,
      webkitExitFullscreen() {
        doc.webkitFullscreenElement = null;
        listeners.get('webkitfullscreenchange')?.();
      },
      addEventListener: (type, listener) => void listeners.set(type, listener),
    };
    const target = {
      webkitRequestFullscreen() {
        doc.webkitFullscreenElement = {} as Element;
        listeners.get('webkitfullscreenchange')?.();
      },
    };
    const control = new FullscreenControl(doc, target, undefined);
    await control.toggle();
    expect(control.active).toBe(true);
    await control.toggle();
    expect(control.active).toBe(false);
  });
});

describe('installation sur l’écran d’accueil', () => {
  const manifest = JSON.parse(manifestText) as { display: string; orientation: string; start_url: string; icons: { src: string; sizes: string; type: string; purpose: string }[] };

  it('le manifeste a les icônes qu’exige Android pour proposer « Installer l’application » (PNG 192 et 512, dont une « maskable »)', () => {
    const { icons } = manifest;
    const has = (size: string, purpose: string) => icons.some((i) => i.sizes === size && i.type === 'image/png' && i.purpose === purpose);
    expect(has('192x192', 'any')).toBe(true);
    expect(has('512x512', 'any')).toBe(true);
    expect(has('512x512', 'maskable')).toBe(true);
  });

  it('le service worker (autre condition d’Android) gère les requêtes et reste sur le site du jeu', () => {
    expect(serviceWorker).toContain("addEventListener('fetch'");
    expect(serviceWorker).toContain('self.location.origin');
  });

  it('le manifeste demande le plein écran et l’horizontal', () => {
    expect(manifest.display).toBe('fullscreen');
    expect(manifest.orientation).toBe('landscape');
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it('la page déclare le manifeste et les balises iOS qui retirent les barres de Safari', () => {
    expect(indexHtml).toContain('rel="manifest"');
    expect(indexHtml).toContain('name="apple-mobile-web-app-capable"');
    expect(indexHtml).toContain('rel="apple-touch-icon"');
  });
});

describe('installation comme application', () => {
  /** Une proposition d'installation factice (l'événement `beforeinstallprompt` de Chrome). */
  function fakeInstall(outcome: string | Error) {
    const calls = { prompted: 0 };
    const event: InstallEvent = {
      prompt: async () => {
        calls.prompted++;
        if (outcome instanceof Error) throw outcome;
      },
      userChoice: Promise.resolve({ outcome: typeof outcome === 'string' ? outcome : 'dismissed' }),
    };
    return { event, calls };
  }

  it('Android : le bouton n’apparaît que quand Chrome a jugé le jeu installable', () => {
    expect(installMode(env({}), false)).toBe('none');
    expect(installMode(env({}), true)).toBe('prompt');
  });

  it('iPhone et iPad : le bouton explique « Partager → Sur l’écran d’accueil » (Apple n’a pas de fenêtre d’installation)', () => {
    expect(installMode(env({ userAgent: IPHONE, fullscreenEnabled: false }), false)).toBe('ios');
    expect(installMode(env({ userAgent: IPAD }), false)).toBe('ios');
  });

  it('reconnaît l’iPad récent, qui se présente comme un Mac, grâce à l’écran tactile', () => {
    expect(isIPad(IPAD, 5)).toBe(true);
    expect(isIPad(IPAD, 0)).toBe(false);
    expect(isIPad(DESKTOP, 0)).toBe(false);
  });

  it('pas de bouton si le jeu est déjà installé, ni sur ordinateur', () => {
    expect(installMode(env({ standalone: true }), true)).toBe('none');
    expect(installMode(env({ userAgent: IPHONE, standalone: true }), false)).toBe('none');
    expect(installMode(env({ userAgent: DESKTOP, coarsePointer: false, maxTouchPoints: 0 }), true)).toBe('none');
  });

  it('garde la proposition du navigateur et la déclenche au toucher du bouton', async () => {
    const control = new InstallControl();
    let changes = 0;
    control.onChange = () => changes++;
    expect(control.available).toBe(false);
    expect(await control.install()).toBe('unavailable');

    const { event, calls } = fakeInstall('accepted');
    control.capture(event);
    expect(control.available).toBe(true);
    expect(await control.install()).toBe('accepted');
    expect(calls.prompted).toBe(1);
    // Une proposition ne sert qu'une fois : le bouton disparaît jusqu'à la prochaine.
    expect(control.available).toBe(false);
    expect(changes).toBe(2);
  });

  it('un refus du joueur, ou une erreur du navigateur, ne casse rien', async () => {
    const control = new InstallControl();
    control.capture(fakeInstall('dismissed').event);
    expect(await control.install()).toBe('dismissed');
    control.capture(fakeInstall(new Error('déjà utilisée')).event);
    expect(await control.install()).toBe('dismissed');
  });

  it('le jeu installé par le menu du navigateur fait disparaître le bouton', () => {
    const control = new InstallControl();
    control.capture(fakeInstall('accepted').event);
    control.installed();
    expect(control.available).toBe(false);
  });
});
