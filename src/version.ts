/**
 * Version du jeu. Elle vient de `package.json` (voir `vite.config.ts`, qui la fournit sous le nom
 * `__APP_VERSION__` au moment de la compilation) : c'est l'unique endroit où la modifier.
 */
declare const __APP_VERSION__: string;

export const APP_VERSION: string = __APP_VERSION__;

/**
 * Texte affiché au menu : « v0.2.0 », avec « (dev) » en plus dans la version de développement
 * (`npm run dev`) pour ne pas la confondre avec la version publiée.
 */
export function versionLabel(version: string = APP_VERSION, dev: boolean = import.meta.env.DEV): string {
  return `v${version}${dev ? ' (dev)' : ''}`;
}

export const VERSION_LABEL = versionLabel();
