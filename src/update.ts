/**
 * Détection d'une nouvelle version du jeu publiée pendant qu'il est ouvert (sans DOM, testable sous Node).
 *
 * Le build écrit `version.json` (voir `vite.config.ts`) avec la version de `package.json`, la même que celle du jeu
 * en cours. Si le serveur en annonce une autre, une mise à jour est disponible.
 */

/** Extrait la version d'un `version.json` ; null si le contenu n'a pas la bonne forme (page d'erreur, fichier absent...). */
export function parseVersion(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const { version } = data as { version?: unknown };
  return typeof version === 'string' && /^\d+\.\d+\.\d+/.test(version) ? version : null;
}

/** Compare la version du jeu en cours à celle du serveur. */
export class UpdateWatcher {
  /** Une version différente de la nôtre est publiée. */
  available = false;
  /** Appelé quand une mise à jour devient disponible. */
  onChange: () => void = () => {};

  /**
   * @param current version du jeu en cours
   * @param readLatest lit le contenu de `version.json` sur le serveur (sans passer par le cache)
   */
  constructor(
    private current: string,
    private readLatest: () => Promise<unknown>,
  ) {}

  /** Interroge le serveur. Hors connexion ou fichier illisible : on ne sait rien, rien ne change. */
  async check(): Promise<boolean> {
    if (this.available) return true;
    try {
      const latest = parseVersion(await this.readLatest());
      if (latest !== null && latest !== this.current) {
        this.available = true;
        this.onChange();
      }
    } catch {
      // Pas de réseau : on réessaiera.
    }
    return this.available;
  }
}
