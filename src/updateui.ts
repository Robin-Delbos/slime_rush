import { APP_VERSION } from './version';
import { UpdateWatcher } from './update';

/** Délai entre deux vérifications, pour une page laissée ouverte longtemps. */
const CHECK_EVERY = 10 * 60 * 1000;

export interface UpdateBanner {
  /** Une nouvelle version est publiée. */
  readonly available: boolean;
  /** Montre ou cache le bandeau (le jeu ne l'affiche qu'au menu et en fin de partie, jamais au risque de perdre une partie). */
  show(visible: boolean): void;
}

/**
 * Prévient le joueur qu'une nouvelle version est disponible, avec un bouton « Actualiser ».
 * La vérification se fait au démarrage, au retour au premier plan (application restée en arrière-plan) et toutes
 * les 10 minutes. Seulement dans la version publiée : `version.json` n'existe pas sous `npm run dev`.
 */
export function setupUpdates(): UpdateBanner {
  const bar = document.getElementById('update-bar') as HTMLElement;
  const watcher = new UpdateWatcher(APP_VERSION, async () => {
    // « no-store » : toujours l'état du serveur, jamais une copie du cache (navigateur ou service worker).
    const response = await fetch('./version.json', { cache: 'no-store' });
    return response.ok ? response.json() : null;
  });
  let visible = false;

  document.getElementById('btn-update')?.addEventListener('click', () => window.location.reload());

  if (import.meta.env.PROD) {
    const check = (): void => void watcher.check();
    check();
    window.setInterval(() => {
      if (!document.hidden) check();
    }, CHECK_EVERY);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) check();
    });
  }

  return {
    get available() {
      return watcher.available;
    },
    show(next: boolean) {
      if (next === visible) return;
      visible = next;
      bar.classList.toggle('hidden', !next);
    },
  };
}
