import { defineConfig } from 'vite';

export default defineConfig({
  // Chemins relatifs : le jeu fonctionne aussi bien à la racine d'un site
  // que dans un sous-dossier (GitHub Pages le sert sous /slime_rush/).
  base: './',
});
