# Slime Rush : consignes pour Claude

Jeu de survie (survivor-like) 3D cartoon : Three.js 0.187, TypeScript, Vite, Vitest. Aucune autre dépendance.
Dépôt public : https://github.com/Robin-Delbos/slime_rush (branche `main`), site : https://robin-delbos.github.io/slime_rush/
Le détail du jeu, des tests et de l'architecture est dans `README.md` : le lire avant de toucher au code.

## Tenir ce fichier à jour

Ce fichier est lu au début de chaque session : il doit rester **court, exact et utile**. Le mettre à jour **de ma propre initiative**, sans attendre qu'on me le demande, quand je le juge nécessaire :

- une règle de travail ou une préférence nouvelle de l'utilisateur, surtout une correction qu'il a dû répéter ;
- un piège qui m'a fait perdre du temps (pour ne pas le refaire) ;
- une commande, une convention ou une structure du projet qui change (nouvel écran, nouveau test, nouveau script dans `tools/`...) ;
- une information devenue fausse ou obsolète : la corriger ou la retirer tout de suite, un conseil périmé est pire que pas de conseil.

À ne pas y mettre : ce que le code, le README ou l'historique git disent déjà, l'état d'une tâche en cours, des détails valables une seule fois. Une procédure longue et réutilisable devient plutôt un skill (voir `creer-skill`), et ce fichier y renvoie.
La modification de ce fichier se commite comme `docs` (sans changer la version), de préférence avec le travail qui l'a motivée, et je le signale à l'utilisateur dans mon compte rendu.

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
- **Icônes** : ne jamais compter sur les emojis du système (ils changent d'un OS à l'autre). Les emojis du texte sont remplacés par des images Twemoji (`public/emoji/`, liste dans `src/emoji.ts`, test dans `tests/emoji.test.ts`). Un nouvel emoji demande son fichier SVG et son ajout à la liste. Même un « © » dans un texte est un pictogramme (fichier `a9.svg`).
- **Ressource tierce** (modèle, icône, police, bibliothèque) : l'ajouter à `CREDITS` (`src/credits.ts`, écran « Crédits et licences ») et au README ; les licences CC BY et MIT exigent une mention dans le jeu publié.
- **Politique de confidentialité dans le jeu** : elle s'ouvre dans un écran du jeu (iframe, `#overlay-privacy`), jamais par un lien `<a>` vers `confidentialite.html` : cette page est dans le champ (`scope`) de l'application installée, donc le lien l'ouvrait dans la fenêtre de l'application, hors du jeu, et la fermer fermait l'application (corrigé). Tout nouveau lien vers une page du site doit suivre la même règle ; les liens externes (crédits) restent `target="_blank"`.
- **Confidentialité** : `public/confidentialite.html` affirme que le jeu ne collecte rien (ni publicité, ni achat, ni statistique). Avant d'ajouter l'un de ceux-là, la mettre à jour, et mettre à jour `LICENSE` si le choix de licence change. Les crédits ne contiennent ni le nom de l'utilisateur ni le lien du dépôt (décision de l'utilisateur).
- **Sauvegarde** : `localStorage`, clé `slime-rush.save`. Tout nouveau champ doit être nettoyé dans `sanitizeSave` (`src/meta.ts`) ; un identifiant renommé va dans `RENAMED_CHARACTERS`.
- **Débogage** : avec `?debug` dans l'URL, `window.__game` expose des raccourcis de test (état, ajout d'or, tuer le héros, etc.), utilisés par les tests e2e.
- **Mode dev** (`npm run dev` seulement) : retiré de la version publiée.
- **Menu à l'horizontale** : sur téléphone (moins de 480 px de haut) le menu, la pause, le choix de niveau et la fin de partie doivent tenir **sans barre de défilement** (décision de l'utilisateur) ; ainsi que l'onglet Coffres de la boutique et l'onglet Héros de la collection ; le test `--only=fit` le vérifie de 320 à 412 px de haut. Les listes (améliorations, apparences, amulettes, sauvegarde) sont compactées sur plusieurs colonnes et tiennent dès 360 px de haut (les amulettes, six types en réserve, équipée ou non, défilent un peu sur 320 px ; le test couvre une amulette équipée, les messages de statut de la sauvegarde et des coffres, et la marge sous « Retour »). Sur les onglets Coffres et Héros, le titre et les onglets ne doivent jamais bouger d'un onglet à l'autre (le test le vérifie) ; le contenu reste serré sous les onglets, sans étirement sur la hauteur de l'écran (l'utilisateur a essayé « aérer » puis y a renoncé). Le menu y est une grille dont `.menu-top` et `.menu-bottom` sont dissous (`display: contents`) : toute nouvelle ligne ajoutée au menu doit avoir sa place dans `grid-template-rows` (bloc « Menu à l'horizontale » de `style.css`) et rester dans le budget de hauteur (~290 px). Le pied de menu (version, crédits, installation) est la dernière rangée, tout en bas (décision de l'utilisateur).
- **Journal des nouveautés** (`src/changelog.ts`) : touché depuis la version du menu, un menu déroulant par version. **À chaque nouvelle version, ajouter son entrée en premier** (le test `tests/changelog.test.ts` échoue sinon), avec seulement ce qui sert au joueur (nouveau, changé, corrigé), jamais de refonte du code, de test ni d'outil ; c'est une demande de l'utilisateur. Les entrées de 0.1.0 à 0.8.1 viennent de l'historique git.
- **Héros** : l'écran des héros montre au plus **trois cartes par rangée** sur tous les écrans (décision de l'utilisateur, cadres lisibles ; le test le vérifie). Le clignotement du héros touché (`hurtTimer`, `game.ts`) ne s'applique qu'en partie : son chrono ne baisse que là, figé hors partie il cachait le héros au menu (corrigé, `__game.blink` le reproduit). L'annonce de boss (`#banner`) est réduite à l'horizontale sur téléphone (test `fit`).
- **Interface** : l'écran du menu a deux pôles, Boutique (améliorations, coffres) et Collection (héros, apparences, amulettes), à onglets. Les textes doivent tenir dans leurs cadres sur petits écrans : le test `--only=texts` (320 px, 360 px, paysage) le vérifie.
- **Vibrations** : le jeu ne fait pas vibrer le téléphone (décision de l'utilisateur).
- **Apparition des ennemis** (`src/spawn.ts`) : toujours hors de la clôture (`FENCE` dans `world.ts`), jamais à moins de 3 unités du héros pour les ennemis ordinaires et de 26 pour les boss (`MIN_SPAWN_DISTANCE`, `BOSS_SPAWN_DISTANCE`, décision de l'utilisateur : la distance courte sert à décourager le camping dans un coin, ne pas la rallonger sans le lui demander). Les boss ne sont bridés (arène + 2) que vers l'extérieur. Tout nouveau type d'ennemi hérite de la règle ; ne pas réintroduire un cercle fixe autour du héros.
- **Joystick** (`src/input.ts`) : direction seule, pleine vitesse dès la zone morte (8 px), point de départ qui suit le doigt au-delà de 50 px (décision de l'utilisateur : le héros « marchait » et changer de direction était lent). Ne pas le remettre proportionnel ni à origine fixe.
- **Jeu à deux mains** (`src/input.ts`) : le premier doigt est le joystick, les suivants ne servent qu'à taper (spécial). Piège de test e2e : `Input.dispatchTouchEvent` ne sait lever que **tous** les doigts à la fois (`touchMove` avec un doigt de moins ne relâche rien) ; les appuis brefs du deuxième doigt sont donc envoyés comme de vrais `PointerEvent` dans la page (voir `orientationScenario`).
- **Plein écran et horizontal** (`src/screen.ts`, `src/screenui.ts`) : décision de l'utilisateur, verrouiller l'horizontal **quand c'est possible** (Android, seulement pendant le plein écran). iPhone : ni plein écran ni verrouillage possibles, d'où l'écran « Tournez votre téléphone » (fermable) et l'installation sur l'écran d'accueil via `public/manifest.webmanifest`. Les tests e2e remplacent ces API par des témoins (`platformShims`).
- **Performances** (`src/quality.ts`) : tout est automatique, sans réglage (décision de l'utilisateur) ; 30 images/s sur mobile, 60 sur PC, résolution ajustée selon le temps d'image mesuré, ombres allégées (seul le héros projette). Cadences : jeu 30 (mobile) / 60 (PC), menu principal 20 / 30, scène figée 10 (`Quality.menuFps`, `frozenFps`). Musique muette = synthèse arrêtée (`MusicPlayer.setMuted`). Ne pas remettre `high-performance` ni des ombres portées pour les ennemis sans mesurer. Avec `?debug`, un compteur `#perf` et `__game.state().quality` donnent les mesures. Les armes cherchent les ennemis proches par `Enemies.nearby` (index spatial `SpatialIndex`, reconstruit par `enemies.reindex()` au début de `Weapons.update`) et non plus en parcourant toute la liste : tout nouveau code qui frappe via `enemies.hit` pendant l'image est suivi automatiquement (`noteMove`), mais une nouvelle arme doit passer par `nearby` (jamais `for (const e of enemies.list)` par image) et garder l'ordre de la liste. Le HUD ne doit écrire dans le DOM que par `setWidth`/`setClass`/`setText` (cache), jamais directement. La séparation des ennemis passe par une grille (`src/grid.ts`) ; un nouvel ennemi dont le rayon dépasse celui d'un boss retombe sur la méthode lente, donc rien à régler, mais mettre à jour `MAX_ENEMY_RADIUS` reste logique. Piège de test : comparer exactement grille et méthode d'origine n'a de sens que sur une foule déjà détendue (une scène aléatoire où tout se chevauche pousse un ennemi de plus de 4 unités en un passage). Piège : un émulateur mobile des tests e2e (pointeur tactile) reçoit le profil 30 images/s.
- **Installation comme application** : Android exige manifeste + icônes PNG 192/512 + service worker (`public/sw.js`, « réseau d'abord », enregistré seulement en production par `src/main.ts`) ; sans eux, Chrome ne propose qu'un raccourci. Le lien `#btn-install` suit l'événement `beforeinstallprompt` (iPhone/iPad : simple explication). Le cache s'appelle `slime-rush-v1` ; ne le changer que pour purger d'anciennes copies. Les PNG d'icônes se refont depuis les SVG avec Chrome sans fenêtre, un profil neuf par image (réutiliser le même profil bloque). **Nouvelle version** : le bandeau « Actualiser » compare `version.json` (écrit au build) à la version du jeu en cours ; il n'apparaît donc que si `package.json` a changé, et jamais en jeu ni en pause (recharger perdrait la partie). Piège de test : Chrome émule le vrai événement `beforeinstallprompt` (le jeu est installable) ; `platformShims` le retient, seule la fausse proposition du test atteint le jeu.

## Pièges rencontrés

- Les longs scripts passés en heredoc dans le shell échouent parfois : écrire les scripts de modification avec l'outil d'écriture de fichiers.
- Lancer `tests/e2e/run.mjs` avec `tests/e2e/output/` comme répertoire courant échoue (`EPERM` : il vide ce dossier) : toujours le lancer depuis la racine (une capture lue avec Read peut y déplacer le répertoire courant).
- `import x from '../fichier.css?raw'` (et `?inline`) renvoie une chaîne vide sous Vitest : on ne peut pas tester le CSS par son texte, seul `tests/e2e/run.mjs` attrape un style manquant (c'est ainsi que le style du compteur `?debug` a été oublié sans que rien ne le signale).
- Ne jamais enchaîner `node script.mjs && cat >> fichier <<EOF` : si le script échoue, l'ajout est silencieusement sauté. Après toute modification de CSS ou de fichier par commande, vérifier avec `grep` que le texte est bien là.
- Les tests n'ont pas `node:fs` typé : lire un fichier avec `import x from '../fichier?raw'`.
- Le serveur de dev Vite redémarre tout seul quand `package.json` change (plugin dans `vite.config.ts`).
- Les `z-index` internes d'un composant remontent dans le contexte parent : le HUD est isolé (`isolation: isolate`) pour que l'écran de pause le floute avec le reste.

## Ajouter du contenu

- **Héros** : un modèle `.glb` cartoon (même style que les autres) avec les animations `Idle`, `Run`, `Death`, puis une entrée dans `CHARACTERS` (`src/meta.ts`). Le modèle se prépare avec `tools/slim-glb.cjs` (usage en tête du fichier : retire les animations inutiles et l'arme tenue en main). Chaque nouveau héros coûte un peu plus cher que le précédent. Modèles pris sur poly.pizza (Quaternius, licence CC0) : les créditer dans le README.
- **Arme, amulette, apparence, ennemi, boss, amélioration** : voir « Ajouter du contenu » dans le README. Les apparences « projectile » et « traînée » ne concernent que les armes marquées `projectiles: true` dans `weaponData.ts`.
- **Équilibre** : un débutant gagne environ 1 000 pièces par partie, un bon joueur environ 10 000 ; les prix sont réglés pour cela (voir README).
