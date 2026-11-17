# Slime Rush

Jeu *survivor-like* en 3D cartoon, jouable dans le navigateur sur PC et sur mobile.
Le héros attaque tout seul : il faut se déplacer, esquiver les ennemis, ramasser les gemmes d'XP et choisir une amélioration à chaque niveau. L'or gagné en partie sert à acheter des améliorations permanentes et de nouveaux personnages.

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

Le tir de base est automatique. Les améliorations se choisissent en cliquant ou en touchant une carte.

**Attaque spéciale** : la jauge en bas à droite se remplit en tuant des ennemis (30 slimes, ou moins avec de gros ennemis). Quand elle brille, un appui bref sur le terrain déclenche une explosion de zone à cet endroit. Les ennemis tués par l'explosion ne rechargent pas la jauge.

**Pause** : le menu de pause permet de reprendre ou de quitter la partie. Quitter affiche le bilan et verse l'or gagné. La partie se met aussi en pause toute seule quand on change d'onglet ou qu'on verrouille le téléphone.

## Ce qu'on ramasse

| Objet | Apparence | Effet |
|---|---|---|
| Gemme d'XP | Losange bleu (rose pour les grosses) avec un halo au sol | Fait monter de niveau pendant la partie |
| Pièce | Disque doré avec un halo au sol | Or conservé après la partie, à dépenser dans le menu |

Le décor (herbe, cailloux, arbres) reste dans les verts et les gris : tout ce qui est coloré et lumineux au sol se ramasse.

## Progression entre les parties

- **Or** : pièces ramassées + 1 pièce par tranche de 10 secondes de survie, versées à la fin de la partie.
- **Boutique** (menu principal) : sept améliorations permanentes à plusieurs niveaux.
- **Personnages** : Pip (gratuit), Bolt (150 pièces), Ombre (400 pièces), chacun avec ses forces et faiblesses.

La sauvegarde est stockée dans le navigateur (`localStorage`). Elle est donc propre à chaque navigateur et à chaque appareil, et disparaît si les données du site sont effacées.

Pour la transporter ailleurs, le bouton 💾 du menu ouvre l'écran **Sauvegarde** : *Exporter* donne un code à copier ou un fichier à télécharger, *Importer* le relit (collé ou choisi comme fichier) et remplace la progression après confirmation. Le réglage du son reste celui de l'appareil.

## Tests

| Commande | Rôle | Durée |
|---|---|---|
| `npm test` | Tests unitaires de la logique de jeu (sans navigateur) | ~5 s |
| `npm run test:watch` | Les mêmes, relancés à chaque modification | continu |
| `npm run test:e2e` | Compile le jeu puis le joue dans Chrome sans fenêtre, en format PC et mobile | ~2 min |
| `npm run test:all` | Types + tests unitaires + test de bout en bout | ~2 min |

À lancer avant de valider une modification : `npm test` pendant le développement, `npm run test:all` avant de considérer une fonctionnalité terminée.

**Tests unitaires** (`tests/*.test.ts`) : ils font tourner la simulation (`src/run.ts`) sans affichage, avec un aléatoire à graine fixe pour être reproductibles. Ils couvrent le héros, les ennemis, les armes, les objets à ramasser, les montées de niveau, la boutique, les personnages, la sauvegarde et la préparation des modèles 3D.

**Test de bout en bout** (`tests/e2e/run.mjs`) : il vérifie le parcours complet (menu, boutique, achat d'un personnage, partie, montée de niveau, mort, retour au menu, sauvegarde conservée après rechargement) et échoue à la moindre erreur ou au moindre avertissement dans la console. Il pilote le Chrome installé sur le poste (Edge en secours), son coupé, sans dépendance supplémentaire. Les captures d'écran de chaque étape sont écrites dans `tests/e2e/output/`. Pour utiliser un autre navigateur, indiquez son chemin dans la variable d'environnement `BROWSER_PATH`.

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
| `src/enemies.ts` | Types d'ennemis, apparition, déplacement, affichage instancié |
| `src/weapons.ts` | Projectiles et orbes |
| `src/pickups.ts` | Gemmes d'XP et pièces |
| `src/upgrades.ts` | Améliorations proposées en cours de partie |
| `src/meta.ts` | Sauvegarde, boutique, personnages |
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

- **Amélioration en partie** : une entrée dans `UPGRADES` (`src/upgrades.ts`).
- **Amélioration permanente** : une entrée dans `SHOP_ITEMS` (`src/meta.ts`).
- **Personnage** : une entrée dans `CHARACTERS` (`src/meta.ts`) et son modèle dans `public/models/`. Le modèle doit contenir des animations nommées `Idle`, `Run` (ou `Running`) et `Death`.
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
