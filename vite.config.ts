import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Source unique de la version du jeu : package.json (affichée au menu, voir src/version.ts).
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // Chemins relatifs : le jeu fonctionne aussi bien à la racine d'un site
  // que dans un sous-dossier (GitHub Pages le sert sous /slime_rush/).
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
});
