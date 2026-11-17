import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Source unique de la version du jeu : package.json (affichée au menu, voir src/version.ts).
const packageFile = fileURLToPath(new URL('./package.json', import.meta.url));
const { version } = JSON.parse(readFileSync(packageFile, 'utf8')) as { version: string };

export default defineConfig({
  // Chemins relatifs : le jeu fonctionne aussi bien à la racine d'un site
  // que dans un sous-dossier (GitHub Pages le sert sous /slime_rush/).
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    {
      // La version n'est lue qu'au démarrage du serveur : sans cela, augmenter la version pendant que
      // `npm run dev` tourne laisserait l'ancien numéro affiché jusqu'au prochain redémarrage à la main.
      // Quand package.json change, le serveur redémarre donc tout seul et la page se recharge.
      name: 'restart-on-package-change',
      configureServer(server) {
        server.watcher.add(packageFile);
        server.watcher.on('change', (file) => {
          if (resolve(file) === resolve(packageFile)) void server.restart();
        });
      },
    },
  ],
});
