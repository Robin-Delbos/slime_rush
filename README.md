# Slime Rush

Jeu *survivor-like* en 3D cartoon, jouable dans le navigateur sur PC et sur mobile.
Le héros attaque tout seul : il faut se déplacer, esquiver les ennemis, ramasser les gemmes d'XP et choisir une amélioration à chaque niveau. On choisit son arme de départ et sa difficulté avant la partie ; l'or gagné sert à débloquer de nouvelles armes, à acheter des améliorations permanentes et des apparences.

Technologies : [Three.js](https://threejs.org/), TypeScript, [Vite](https://vite.dev/), [Vitest](https://vitest.dev/).

## Prérequis

- [Node.js](https://nodejs.org/) 20 ou plus récent (npm est fourni avec)
- Un navigateur récent (Chrome recommandé)

## Installation

À faire une seule fois, à la racine du projet :

```
npm install
```

## Lancer le jeu sur PC

```
npm run dev
```

Ouvrez ensuite l'adresse affichée dans le terminal (par défaut `http://localhost:5173`).
Le jeu se recharge automatiquement à chaque modification du code. `Ctrl+C` arrête le serveur.

## Tester sur téléphone

1. Connectez le téléphone au même réseau Wi-Fi que le PC.
2. Lancez :

   ```
   npm run dev:mobile
   ```

3. Ouvrez sur le téléphone l'adresse `Network` affichée dans le terminal (du type `http://192.168.x.x:5173`).

Si la page ne s'ouvre pas, le pare-feu du PC bloque probablement les connexions entrantes sur ce port.

## Contrôles

| Action | PC | Mobile |
|---|---|---|
| Se déplacer | `ZQSD` ou flèches, ou clic maintenu puis glisser | Poser le doigt n'importe où et glisser (joystick flottant) |
| Attaque spéciale | Clic bref sur la zone à frapper, ou `Espace` (vise l'ennemi le plus proche) | Appui bref sur la zone à frapper |
| Pause | `Échap` ou `P`, ou bouton ⏸ | Bouton ⏸ |

Les armes attaquent toutes seules. À chaque niveau, on choisit une carte en cliquant ou en touchant : niveau suivant de votre arme, ou bonus passif. Chaque passage de niveau rend aussi 10 % des PV max.

**Attaque spéciale** : la jauge en bas à droite se remplit en tuant des ennemis (30 slimes, ou moins avec de gros ennemis). Quand elle brille, un appui bref sur le terrain déclenche une explosion de zone à cet endroit. Les ennemis tués par l'explosion ne rechargent pas la jauge.

**Pause** : le menu de pause permet de reprendre ou de quitter la partie. Quitter affiche le bilan et verse l'or gagné. La partie se met aussi en pause toute seule quand on change d'onglet ou qu'on verrouille le téléphone.

## Ce qu'on ramasse

| Objet | Apparence | Effet |
|---|---|---|
| Gemme d'XP | Losange bleu (rose pour les grosses) avec un halo au sol | Fait monter de niveau pendant la partie |
| Pièce | Disque doré avec un halo au sol | Or conservé après la partie, à dépenser dans le menu |

Le décor (herbe, cailloux, arbres) reste dans les verts et les gris : tout ce qui est coloré et lumineux au sol se ramasse.

## Armes

On choisit **une** arme au menu et on la garde pendant toute la partie. Chaque arme a 6 niveaux, avec ses propres améliorations : à chaque montée de niveau, les cartes proposées sont les niveaux suivants de cette arme et des bonus passifs.

| Arme | Style | Prix de déblocage |
|---|---|---|
| Carabine | Tire sur l'ennemi le plus proche : projectiles multiples, perforation | gratuite |
| 🔮 Gardiens | Des orbes tournent autour de vous : défense, orbite plus large | 120 🪙 |
| 🔥 Aura ardente | Pulsations de dégâts et de recul autour de vous : combat rapproché | 200 🪙 |
| 🔱 Lance | Transperce toute une ligne d'ennemis : gros dégâts, recharge lente | 300 🪙 |

Les bonus passifs, communs à toutes les armes, sont : Force, Bottes, Cœur, Régénération, Aimant.

## Difficulté

Quatre niveaux au choix au menu. Plus c'est difficile, plus il y a d'ennemis, résistants et dangereux, et plus l'or rapporté en fin de partie est multiplié.

| Difficulté | Ennemis (nombre / PV / dégâts) | Or |
|---|---|---|
| 🌱 Facile | ×0,8 / ×0,8 / ×0,7 | ×0,6 |
| ⚔️ Normal | ×1 / ×1 / ×1 | ×1 |
| 🔥 Difficile | ×1,25 / ×1,3 / ×1,4 | ×1,5 |
| 💀 Extrême | ×1,5 / ×1,7 / ×1,8 | ×2,2 |

Dans tous les cas, la force des ennemis augmente avec le temps de partie, et plus vite passé 3 minutes.

## Boss

Un boss arrive toutes les **2 minutes**, avec **un boss de plus à chaque vague** (jusqu'à 4 en même temps, apparition espacée de quelques secondes). Un message et un cor d'alarme l'annoncent.

- Il est lent et très résistant, et sa force suit le temps de partie comme celle des autres ennemis (et la difficulté choisie).
- Il s'arrête pour viser : une bande rouge au sol montre la direction de sa charge, qu'il faut esquiver en se décalant.
- Chaque boss a sa barre de vie au-dessus de lui ; hors de l'écran, elle est ramenée au bord pour montrer d'où il vient.
- À sa mort, il lâche une grosse gerbe de pièces et de gemmes d'XP.

## Coffres et collection

Au menu, **🎁 Coffres** permet d'ouvrir un coffre pour **1000 pièces**, ou **trois coffres pour 2500 pièces**. Chaque coffre contient, au hasard :

| Contenu | Chance | Détail |
|---|---|---|
| Arme exclusive aux coffres | ~1 % | Introuvable en boutique ; elle est un peu plus forte que les autres armes. Apparaît au menu une fois trouvée. |
| Amulette | ~38 % | Effet pour **une seule partie** : elle est consommée au lancement. Chaque exemplaire en plus la renforce (jusqu'à 3 utilisés d'un coup). |
| Apparence | ~32 % | Couleur des projectiles, traînée derrière eux, poussière sous les pas. Jamais deux fois la même. |
| Pièces | ~29 % | De 200 à 10 000 pièces, les petits montants étant les plus fréquents. |

**🎒 Collection** (au menu, ou depuis l'écran des coffres) : on y équipe l'amulette de la prochaine partie (et son niveau, selon le nombre d'exemplaires) et on choisit ses apparences. Amulettes : Œil de sage (XP), Cœur de pierre (PV), Bourse sans fond (pièces), Plume de vent (vitesse), Croc de loup (dégâts), Pierre tourbillon (portée de ramassage).

## Progression entre les parties

- **Or** : pièces ramassées + 1 pièce par tranche de 10 secondes de survie, multipliées selon la difficulté, versées à la fin de la partie.
- **Armes** : à débloquer avec de l'or (voir ci-dessus).
- **Boutique** (menu principal) : sept améliorations permanentes à plusieurs niveaux.
- **Apparences** (dans la boutique) : Ombre (gratuit, le héros d'origine), Bolt (150 pièces), Pip (400 pièces). Elles changent l'aspect du héros, sans effet sur le jeu.

La sauvegarde est stockée dans le navigateur (`localStorage`). Elle est donc propre à chaque navigateur et à chaque appareil, et disparaît si les données du site sont effacées.

Pour la transporter ailleurs, le bouton 💾 du menu ouvre l'écran **Sauvegarde** : *Exporter* donne un code à copier ou un fichier à télécharger, *Importer* le relit (collé ou choisi comme fichier) et remplace la progression après confirmation. Le réglage du son reste celui de l'appareil.

## Version

La version du jeu (`0.x.y`) est écrite à un seul endroit, le champ `version` de `package.json`, et s'affiche en petit sous les boutons du menu (« v0.2.0 », avec « (dev) » en plus sous `npm run dev`). Elle est augmentée à chaque commit qui change le jeu : `feat` → version mineure (0.2.0 → 0.3.0), `fix` → correctif (0.2.0 → 0.2.1), rien pour la documentation, les tests ou la CI. Commande : `npm version minor --no-git-tag-version` (ou `patch`).

## Mode dev

Avec `npm run dev` uniquement (il n'existe pas dans la version publiée), un bouton **🛠 Dev** apparaît en haut à gauche du menu pour gagner du temps pendant les tests :

- **Niveau et temps de départ** : choisir le niveau (1 à 150) et le temps de survie (0 à 60 min) avant de lancer la partie, avec ou sans les améliorations d'un joueur de ce niveau, et trois préréglages (niveau 25, boss ×4, niveau 99). Les records de temps ne sont pas modifiés et l'or de fin de partie ne compte que le temps réellement joué.
- **Coffres à 1 pièce** : un coffre pour 1 pièce, trois pour 2 pièces. Cette option est indépendante de la précédente.

Les réglages sont conservés d'une session à l'autre, séparément de la sauvegarde du jeu.

## Tests

| Commande | Rôle | Durée |
|---|---|---|
| `npm test` | Tests unitaires de la logique de jeu (sans navigateur) | ~5 s |
| `npm run test:watch` | Les mêmes, relancés à chaque modification | continu |
| `npm run test:e2e` | Compile le jeu puis le joue dans Chrome sans fenêtre, en format PC et mobile | ~2 min |
| `npm run test:e2e:mobile` | Joue au doigt sur quatre tailles de téléphone, à la verticale puis à l'horizontale, et fait pivoter l'appareil en pleine partie | ~1 min |
| `npm run test:all` | Types + tests unitaires + test de bout en bout | ~2 min |

À lancer avant de valider une modification : `npm test` pendant le développement, `npm run test:all` avant de considérer une fonctionnalité terminée.

**Tests unitaires** (`tests/*.test.ts`) : ils font tourner la simulation (`src/run.ts`) sans affichage, avec un aléatoire à graine fixe pour être reproductibles. Ils couvrent le héros, les ennemis, les armes, les objets à ramasser, les montées de niveau, la boutique, les armes, les difficultés, les apparences, la sauvegarde et la préparation des modèles 3D.

**Test de bout en bout** (`tests/e2e/run.mjs`) : il vérifie le parcours complet (menu, boutique, achat d'une apparence et d'une arme, choix de la difficulté, partie, montée de niveau, mort, retour au menu, sauvegarde conservée après rechargement) et échoue à la moindre erreur ou au moindre avertissement dans la console. Il pilote le Chrome installé sur le poste (Edge en secours), son coupé, sans dépendance supplémentaire. Les captures d'écran de chaque étape sont écrites dans `tests/e2e/output/`. Pour utiliser un autre navigateur, indiquez son chemin dans la variable d'environnement `BROWSER_PATH`.

Ajouter `?debug` à l'adresse du jeu expose `window.__game` (état, mort immédiate, ajout d'or), utilisé par ce test.

## Autres commandes

| Commande | Rôle |
|---|---|
| `npm run build` | Vérifie les types et génère la version de production dans `dist/` |
| `npm run preview` | Sert le contenu de `dist/` en local pour le vérifier |

Le dossier `dist/` est un site statique aux chemins relatifs : il peut être déposé tel quel sur un hébergeur, à la racine ou dans un sous-dossier.

## Version en ligne

Chaque push sur `main` publie le jeu sur GitHub Pages : https://robin-delbos.github.io/slime_rush/

La publication est faite par `.github/workflows/deploy.yml` : installation, tests unitaires, compilation, mise en ligne. Si un test échoue, la version en ligne n'est pas remplacée. L'avancement se suit dans l'onglet *Actions* du dépôt.

Réglage à faire une seule fois sur GitHub : *Settings → Pages → Source : GitHub Actions* (le dépôt doit être public avec un compte gratuit).

## Organisation du code

| Fichier | Rôle |
|---|---|
| `index.html` | Page, HUD et écrans (menu, boutique, niveau, fin de partie) |
| `src/main.ts` | Point d'entrée |
| `src/game.ts` | Chef d'orchestre : relie simulation, rendu, interface, sons et sauvegarde |
| `src/run.ts` | Simulation d'une partie, sans affichage (c'est elle que les tests font tourner) |
| `src/player.ts` | État et caractéristiques du héros |
| `src/enemies.ts` | Types d'ennemis et de boss, apparition, déplacement, affichage instancié |
| `src/weapons.ts` | Comportement des armes (projectiles, orbes, aura, lances) |
| `src/weaponData.ts` | Catalogue des armes : niveaux et valeurs, sans rendu |
| `src/pickups.ts` | Gemmes d'XP et pièces |
| `src/upgrades.ts` | Cartes de montée de niveau : bonus passifs et niveaux d'armes |
| `src/meta.ts` | Sauvegarde, boutique, armes à débloquer, apparences, difficultés |
| `src/chests.ts` | Contenu des coffres : prix, probabilités, tirage et rangement dans la sauvegarde |
| `src/amulets.ts` | Amulettes (effet pour une partie) |
| `src/cosmetics.ts` | Apparences à collectionner : projectiles, traînées, poussière |
| `src/assets.ts` | Chargement des modèles 3D |
| `src/bake.ts` | Conversion des animations en images fixes (voir ci-dessous) |
| `src/hero.ts` | Modèle animé du héros |
| `src/effects.ts` | Particules et textes flottants |
| `src/audio.ts` | Bruitages synthétisés (aucun fichier son) |
| `src/world.ts` | Scène, caméra, lumières, décor |
| `src/input.ts` | Clavier et joystick tactile |
| `src/ui.ts` | Interface HTML |
| `src/rng.ts` | Aléatoire de la simulation, remplaçable par une graine fixe |
| `public/models/` | Modèles 3D (format GLB) |

### Ajouter du contenu

- **Bonus passif en partie** : une entrée dans `PASSIVES` (`src/upgrades.ts`).
- **Arme** : ses 6 niveaux dans `WEAPONS` (`src/weaponData.ts`) et son comportement dans `src/weapons.ts`. Le test « Données des armes » vérifie que chaque niveau apporte quelque chose.
- **Difficulté** : une entrée dans `DIFFICULTIES` (`src/meta.ts`).
- **Amulette** : une entrée dans `AMULETS` (`src/amulets.ts`) ; **apparence** : une entrée dans `COSMETICS` (`src/cosmetics.ts`) ; **arme de coffre** : une arme avec `chest: true` dans `WEAPONS`.
- **Boss** : un type avec `boss: true` dans `DEFS` (`src/enemies.ts`) ; la cadence et le plafond sont dans `src/run.ts` (`BOSS_INTERVAL`, `MAX_BOSSES`).
- **Amélioration permanente** : une entrée dans `SHOP_ITEMS` (`src/meta.ts`).
- **Apparence** : une entrée dans `CHARACTERS` (`src/meta.ts`) et son modèle dans `public/models/`. Le modèle doit contenir des animations nommées `Idle`, `Run` (ou `Running`) et `Death`.
- **Ennemi** : une entrée dans `DEFS` (`src/enemies.ts`), et son modèle dans `ENEMY_MODELS` (`src/assets.ts`).

### Comment des centaines d'ennemis animés restent fluides

Three.js ne sait pas afficher en un seul appel des centaines de modèles animés par squelette. Au chargement, `src/bake.ts` calcule donc la forme de chaque ennemi à 12 instants de son animation de marche. Chaque image devient un maillage instancié, et chaque ennemi est rangé à chaque instant dans l'image qui correspond à son avancement. Résultat : au plus 12 appels de dessin par type d'ennemi, quel que soit leur nombre.

Si un modèle ne se charge pas, il est remplacé par une forme simple et le jeu reste jouable.

## Crédits

Modèles 3D de [Quaternius](https://quaternius.com/), sous licence [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (domaine public), récupérés sur [poly.pizza](https://poly.pizza/u/Quaternius) :

| Fichier | Modèle d'origine |
|---|---|
| `hero-pip.glb` | Animated Platformer Character |
| `hero-bolt.glb` | Animated Robot |
| `hero-ombre.glb` | Character Animated |
| `slime.glb` | Slime Enemy |
| `bat.glb` | Bat |
| `orc.glb` | Orc Enemy |
| `skull.glb` | Skull Enemy |
