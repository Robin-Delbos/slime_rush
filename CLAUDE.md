# Slime Rush : consignes pour Claude

Jeu de survie (survivor-like) 3D cartoon : Three.js 0.187, TypeScript, Vite, Vitest. Aucune autre dépendance.
Dépôt public : https://github.com/Robin-Delbos/slime_rush (branche `main`), site : https://robin-delbos.github.io/slime_rush/
Le détail du jeu, des tests et de l'architecture est dans `README.md` : le lire avant de toucher au code.

## Façon de travailler

- **Toujours répondre en français**, y compris les messages de commit.
- **Poste d'entreprise : n'installer aucun logiciel.** Seulement des paquets npm locaux au projet (déjà le choix de Three.js seul).
- **Ne pas committer sans demande.** Quand l'utilisateur demande « qu'en penses-tu » ou « propose-moi », répondre par des propositions avant de coder.
- **Tests** :
  - après chaque demande : `npx tsc --noEmit` puis `npx vitest run` seulement ;
  - la suite complète `npm run test:all` (avec les tests de bout en bout sur Chrome) uniquement avant un commit/push ;
  - si l'utilisateur dit de ne pas relancer les tests e2e, ne pas le faire ;
  - toute fonctionnalité ou correction apporte son test (skill `tests-non-regression`) ; un défaut d'affichage s'attrape dans `tests/e2e/run.mjs`.
- **Tests navigateur** : Chrome, son coupé, via le protocole DevTools (`tests/e2e/run.mjs`, sans dépendance). On ne peut pas tester le vrai Safari/iOS : le test `--only=platforms` émule seulement l'identité, l'écran, le tactile et l'absence de certaines API.
- **Processus de test** : ne jamais tuer tous les `chrome.exe` (ce serait fermer le navigateur de l'utilisateur) ; viser seulement les processus lancés par les tests.

## Commits, version, release

- Commit en français au format `type: description` (skill `commit-fr`), puis `git push`. Identité : `robin-delbos@users.noreply.github.com`, jamais l'adresse professionnelle. Terminer le message par la ligne `Co-Authored-By` demandée par l'outil.
- **Version** (skill `versionner`) : `feat` → version mineure, `fix` → correctif, rien pour `docs`/`test`/`chore`/`ci`. Se fait avec `npm version minor --no-git-tag-version` **avant** les tests complets, après avoir vérifié avec `git show HEAD:package.json` qu'elle n'est pas déjà augmentée. Annoncer ancienne → nouvelle version.
- **Tag et release** : créés automatiquement par `.github/workflows/release.yml` au push d'une nouvelle version (notes = message du commit). Ne jamais créer de tag à la main ; vérifier l'apparition de la release via l'API publique GitHub après le push.

## Particularités du code à connaître

- **Séparation** : la simulation (`Run` et les modules `src/*` sans affichage) est testable sous Node ; `Game` (`src/game.ts`) orchestre le rendu, l'interface et les sons.
- **Aléatoire** : toujours via `src/rng.ts` (graine fixe dans les tests).
- **Sons** : tout est synthétisé avec WebAudio (`src/audio.ts`, `src/music.ts`), aucun fichier audio. L'audio ne démarre qu'après un geste de l'utilisateur.
- **Icônes** : ne jamais compter sur les emojis du système (ils changent d'un OS à l'autre). Les emojis du texte sont remplacés par des images Twemoji (`public/emoji/`, liste dans `src/emoji.ts`, test dans `tests/emoji.test.ts`). Un nouvel emoji demande son fichier SVG et son ajout à la liste.
- **Sauvegarde** : `localStorage`, clé `slime-rush.save`. Tout nouveau champ doit être nettoyé dans `sanitizeSave` (`src/meta.ts`) ; un identifiant renommé va dans `RENAMED_CHARACTERS`.
- **Débogage** : avec `?debug` dans l'URL, `window.__game` expose des raccourcis de test (état, ajout d'or, tuer le héros, etc.), utilisés par les tests e2e.
- **Mode dev** (`npm run dev` seulement) : retiré de la version publiée.
- **Interface** : l'écran du menu a deux pôles, Boutique (améliorations, coffres) et Collection (héros, apparences, amulettes), à onglets. Les textes doivent tenir dans leurs cadres sur petits écrans : le test `--only=texts` (320 px, 360 px, paysage) le vérifie.
- **Vibrations** : le jeu ne fait pas vibrer le téléphone (décision de l'utilisateur).

## Pièges rencontrés

- Les longs scripts passés en heredoc dans le shell échouent parfois : écrire les scripts de modification avec l'outil d'écriture de fichiers.
- Les tests n'ont pas `node:fs` typé : lire un fichier avec `import x from '../fichier?raw'`.
- Le serveur de dev Vite redémarre tout seul quand `package.json` change (plugin dans `vite.config.ts`).
- Les `z-index` internes d'un composant remontent dans le contexte parent : le HUD est isolé (`isolation: isolate`) pour que l'écran de pause le floute avec le reste.

## Ajouter du contenu

- **Héros** : un modèle `.glb` cartoon (même style que les autres) avec les animations `Idle`, `Run`, `Death`, puis une entrée dans `CHARACTERS` (`src/meta.ts`). Le modèle se prépare avec `tools/slim-glb.cjs` (usage en tête du fichier : retire les animations inutiles et l'arme tenue en main). Chaque nouveau héros coûte un peu plus cher que le précédent. Modèles pris sur poly.pizza (Quaternius, licence CC0) : les créditer dans le README.
- **Arme, amulette, apparence, ennemi, boss, amélioration** : voir « Ajouter du contenu » dans le README. Les apparences « projectile » et « traînée » ne concernent que les armes marquées `projectiles: true` dans `weaponData.ts`.
- **Équilibre** : un débutant gagne environ 1 000 pièces par partie, un bon joueur environ 10 000 ; les prix sont réglés pour cela (voir README).
