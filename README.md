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
| Attaque spéciale | Clic bref sur la zone à frapper, ou `Espace` (vise l'ennemi le plus proche) | Appui bref sur la zone à frapper, **avec un deuxième doigt** si le premier déplace déjà le héros (jeu à deux mains) |
| Pause | `Échap` ou `P`, ou bouton ⏸ | Bouton ⏸ |

Les armes attaquent toutes seules. À chaque niveau, on choisit une carte en cliquant ou en touchant : niveau suivant de votre arme, ou bonus passif. Chaque passage de niveau rend aussi 10 % des PV max.

**Jeu à deux mains (mobile)** : le premier doigt posé est le joystick ; tant qu'il reste posé, tout autre doigt ne déplace rien, mais un appui bref de sa part (moins de 250 ms, presque immobile) déclenche l'attaque spéciale à l'endroit touché. Si le premier doigt se lève, le héros s'arrête et un autre doigt ne reprend pas le joystick : il faut reposer un doigt. Un pouce posé trop longtemps, ou qui glisse, ne frappe pas. Le suivi est dans `src/input.ts` (`Input`).

**Attaque spéciale** : la jauge en bas à droite se remplit en tuant des ennemis (30 slimes, ou moins avec de gros ennemis). Quand elle brille, un appui bref sur le terrain déclenche une explosion de zone à cet endroit. Les ennemis tués par l'explosion ne rechargent pas la jauge.

**Pause** : le menu de pause permet de reprendre ou de quitter la partie, et de couper la **musique** seule ou **tout le son** (réglages conservés). Quand tout le son est coupé, le bouton de la musique est grisé (comme au menu) : on ne peut la remettre qu'avec le son. L'écran de pause floute aussi le niveau et les PV. Quitter affiche le bilan et verse l'or gagné. La partie se met aussi en pause toute seule quand on change d'onglet ou qu'on verrouille le téléphone.

**Plein écran et horizontal (mobile)** : sur téléphone et tablette, un bouton (quatre coins, à côté du son au menu, et « Plein écran » dans le menu pause) masque les barres du navigateur, à la verticale comme à l'horizontale. Sur **Android**, il verrouille aussi l'écran à l'horizontal tant que le plein écran dure (le navigateur n'accepte le verrouillage que dans ce cas) ; sans plein écran, le jeu reste jouable dans les deux sens. Sur **iPhone**, Apple interdit le plein écran et le verrouillage : le bouton explique d'ajouter le jeu à l'écran d'accueil (le manifeste `public/manifest.webmanifest` le lance alors en plein écran, sans barre), et un écran « Tournez votre téléphone » s'affiche à la verticale et met la partie en pause (« Jouer quand même à la verticale » le ferme, pour qui a verrouillé la rotation dans iOS). Un PC n'a pas de bouton (`F11` suffit).

**Installer le jeu comme une application** (mobile) : le lien « Installer l'application » du menu (sous les boutons, à côté des crédits) n'apparaît que sur téléphone et tablette, tant que le jeu n'est pas installé. Sur **Android** (Chrome), il ouvre la fenêtre d'installation du navigateur : c'est une vraie application (WebAPK, icône dédiée, sans barre), pas un simple raccourci. Chrome ne la propose que si le jeu a un manifeste, des icônes PNG 192 et 512 px et un service worker (`public/sw.js`) ; le lien n'apparaît donc qu'une fois que Chrome a jugé le jeu installable. Sur **iPhone et iPad**, Apple ne permet aucune installation par code : le lien explique « Partager → Sur l'écran d'accueil ». Le service worker garde une copie des fichiers du jeu pour jouer hors connexion, en « réseau d'abord » : en ligne on reçoit toujours la dernière version, la copie ne sert qu'hors connexion. Il n'est enregistré que dans la version publiée (pas sous `npm run dev`).

**Économie d'énergie (automatique, sans réglage)** : le jeu ne dessine pas le plus possible, pour que le téléphone ou le PC ne chauffe pas et que la batterie dure. Les choix sont dans `src/quality.ts` : **30 images/s sur mobile, 60 sur PC** (même sur un écran à 90, 120 ou 144 Hz) ; **résolution ajustée automatiquement** selon le temps réellement écoulé entre deux images (trop lent → la résolution baisse par paliers jusqu'à 0,75 ; cadence tenue longtemps → elle remonte prudemment, et si une remontée fait rechuter la patience double, pour ne pas osciller) ; résolution maximale de 1,5 sur mobile et de 2 sur PC ; **ombres allégées** (seul le héros projette une ombre portée, les ennemis gardent leur disque d'ombre au sol ; carte d'ombres de 1024 px sur mobile) ; anticrénelage seulement sur les écrans de densité inférieure à 1,5 ; la puce graphique est choisie par le navigateur (plus de « high-performance », qui forçait la plus gourmande des portables) ; **scène figée** (pause, choix de niveau, et au menu les écrans qui cachent la 3D : boutique, sauvegarde, crédits, ouverture des coffres ; pas la collection, qui montre le héros en 3D) redessinée à 10 images/s ; **menu principal à 30 images/s sur PC et 20 sur mobile** (le héros ne fait que respirer ; la cadence de jeu revient pendant l'aperçu d'un héros dans la collection, et la mesure de la résolution automatique ne se fait qu'à la cadence de jeu) ; **musique qui ne se synthétise plus du tout quand le son ou la musique est coupé** (plus de notes fabriquées pour rien, plus de minuteur toutes les 50 ms ; elle repart du début de la piste au retour du son) ; **HUD qui n'écrit dans le DOM que quand une valeur change** (barres de vie et d'XP, jauge spéciale : une écriture de style peut forcer un nouveau calcul de mise en page) ; **filtrage anisotrope du sol** à 2 sur mobile et 4 sur PC ; sur mobile, plus de flou (`backdrop-filter`) derrière les écrans. La simulation suit le temps réel : à 30 images/s le jeu va à la même vitesse, avec des pas de temps plus grands. **Séparation des ennemis par grille** (`src/grid.ts`) : pour ne pas se superposer, les ennemis se repoussent. Comparer chaque paire coûtait environ 45 000 tests par image à 300 ennemis ; une grille de cases (taille : deux fois le plus grand rayon, plus une marge) limite maintenant les tests aux ennemis des cases voisines, soit moins de 5 % des paires pour une foule répartie dans l'arène. Les paires sont traitées dans le même ordre que l'ancienne méthode (`separateBruteForce`, gardée comme référence de test et comme secours si un rayon dépasse la taille des cases) : les positions sont identiques tant qu'aucun ennemi ne se déplace de plus de ~3,8 unités pendant un passage, ce qui n'arrive pas en jeu puisque la foule est séparée à chaque image. **Recherches des armes par index spatial** (`SpatialIndex`, `src/grid.ts`) : tirs, orbes, aura et mines parcouraient les 300 ennemis (un tir le faisait chacun pour soi, à chaque image). Les ennemis sont rangés dans des cases une fois par image (`Enemies.reindex`), puis `Enemies.nearby` ne renvoie que ceux des cases voisines, **dans l'ordre de la liste** : le résultat est exactement celui du parcours complet (un test joue la même partie des deux façons et compare tout). Les reculs infligés pendant l'image déplacent les ennemis après leur rangement : leur somme est suivie, et élargit la recherche, au besoin jusqu'à tous les ennemis. Le compteur du mode `?debug` (voir « Mode debug ») permet de mesurer tout cela.

**Nouvelle version disponible** : une page ou une application laissée ouverte garde l'ancien code jusqu'à son rechargement. Le build écrit donc `version.json` (la version de `package.json`) ; le jeu le lit sans cache au démarrage, au retour au premier plan et toutes les 10 minutes. Si la version du serveur diffère de la sienne, un bandeau « Nouvelle version disponible » avec un bouton **Actualiser** (rechargement de la page) apparaît, **au menu et en fin de partie seulement** : jamais en jeu ni en pause, car recharger ferait perdre la partie en cours. Hors connexion, rien ne s'affiche. Le message dépend du numéro de version : tout changement du jeu doit donc l'augmenter (c'est déjà la règle pour `feat` et `fix`).

## Apparition des ennemis

Les ennemis, boss compris, **apparaissent toujours à l'extérieur de la clôture**, corps entier dehors, puis marchent vers le héros (la clôture est un décor : ils la traversent). Une direction est tirée autour du héros et on suit ce rayon jusqu'à sortir du carré de la clôture (`src/spawn.ts`) : ils arrivent de tous côtés, et plus souvent du côté proche quand le héros longe un bord. Ils n'apparaissent **jamais à moins de 26 unités du héros** (l'ancienne distance fixe) : collé à un bord, les directions trop proches sont écartées, et si aucune ne convient une direction vers le centre de l'arène prend le relais. Un boss apparu dehors n'est pas ramené d'un coup dans l'arène : sa limite de déplacement (arène + 2) ne l'empêche que de s'éloigner davantage. Conséquence sur le rythme : un ennemi met plus de temps à arriver (environ 20 s pour un slime, 10 s pour une chauve-souris, depuis le centre).

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
| 🔮 Gardiens | Des orbes tournent autour de vous : défense, orbite plus large | 400 🪙 |
| 🔥 Aura ardente | Pulsations de dégâts et de recul autour de vous : combat rapproché | 1 200 🪙 |
| 🔱 Lance | Transperce toute une ligne d'ennemis : gros dégâts, recharge lente | 3 000 🪙 |

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

Dans la **🎁 Boutique** (onglet *Coffres*), on peut ouvrir un coffre pour **1000 pièces**, ou **trois coffres pour 2500 pièces**. L'ouverture se fait en **plein écran** : le coffre tombe et tremble (un toucher l'ouvre tout de suite), éclate dans la lumière, puis révèle une grande carte annoncée selon sa rareté, avec confettis et sons (le téléphone ne vibre pas). Plusieurs coffres s'enchaînent d'un toucher jusqu'à un récapitulatif, et le bouton « Encore » permet d'en ouvrir d'autres sans quitter l'écran. Chaque coffre contient, au hasard :

| Contenu | Chance | Détail |
|---|---|---|
| Arme exclusive aux coffres | ~1 % | Introuvable en boutique ; elle est un peu plus forte que les autres armes. Elle sème des mines **en marchant** (rester sur place n'en pose pas). Apparaît au menu une fois trouvée. |
| Amulette | ~38 % | Effet pour **une seule partie** : elle est consommée au lancement, puis **déséquipée** même s'il en reste (il faut la rééquiper pour la partie suivante). Chaque exemplaire en plus la renforce (jusqu'à 3 utilisés d'un coup). |
| Apparence | ~32 % | Couleur des projectiles, traînée derrière eux, poussière sous les pas. Jamais deux fois la même. |
| Héros exclusif aux coffres | 5 % | **Pirate** ou **Lis**, tirés au hasard parmi ceux qu'on n'a pas encore (jamais deux fois le même) ; ils ne s'achètent pas. Une fois les deux trouvés, ce tirage donne des pièces. |
| Pièces | ~24 % | De 200 à 10 000 pièces, les petits montants étant les plus fréquents. |

Pendant l'ouverture en plein écran, la **musique des coffres** (Sol majeur, entraînante : basse « oom-pah », accords à contretemps, charleston) remplace celle du menu, puis le menu la retrouve à la fermeture.

**Probabilités** : dans l'onglet *Coffres* de la boutique, une petite icône « i » (à côté du texte d'accroche) affiche le tableau « Probabilités du contenu » (les stores l'exigent pour un contenu aléatoire). Le tableau ne nomme pas l'arme ni les héros exclusifs : on les découvre dans le coffre. Le tableau est calculé à partir des mêmes constantes que le tirage (`CHEST_ODDS`, `COIN_TIERS`) : ce qui est annoncé est toujours ce qui se passe, et un test le vérifie sur des dizaines de milliers de tirages.

**Raretés** : la rareté de la carte décide seule du son, du flash et des confettis (deux contenus de même rareté ont les mêmes). *Commune* : pièces de moins de 1 000. *Rare* : amulettes, apparences, pièces de 1 000 à moins de 3 000. *Légendaire* : héros exclusifs, pièces de 3 000 et plus (jackpot). *Mythique* : l'arme exclusive, la plus rare (~1 %), avec sa fanfare, ses couleurs irisées et le plus de confettis.

**🎒 Collection** (au menu) : trois onglets. *Héros* : on choisit (ou on achète) son personnage. *Apparences* : couleurs des projectiles, traînées et poussière trouvées dans les coffres. *Amulettes* : on équipe l'amulette de la prochaine partie (et son niveau, selon le nombre d'exemplaires). Amulettes : Œil de sage (XP), Cœur de pierre (PV), Bourse sans fond (pièces), Plume de vent (vitesse), Croc de loup (dégâts), Pierre tourbillon (portée de ramassage).

## Progression entre les parties

- **Or** : pièces ramassées + 1 pièce par tranche de 10 secondes de survie, multipliées selon la difficulté, versées à la fin de la partie.
- **Armes** : à débloquer avec de l'or (voir ci-dessus).
- **Boutique** (menu principal, onglet *Améliorations* ; l'onglet *Coffres* ouvre les coffres) : sept améliorations permanentes à plusieurs niveaux. Le prix d'un niveau monte de 60 % à chaque niveau (80 % pour Vitalité et Puissance, qui coûtent près de 4 000 à 5 000 pièces au dernier niveau) : environ 24 000 pièces pour tout acheter.
- **Repères d'économie** : un débutant gagne environ 1 000 pièces par partie, un bon joueur environ 10 000. Les prix sont réglés pour que la boutique prenne une vingtaine de parties à un débutant et deux ou trois à un bon joueur, et que les coffres (1 000 pièces) soient le grand puits à pièces de la fin de jeu.
- **Héros** (collection, onglet *Héros*) : Ombre (gratuit, le héros d'origine), Anne (1 000 pièces), Sam (2 500), Bolt (3 000), Matt (3 500) et Pip (4 000), plus Pirate et Lis qu'on ne trouve que dans les coffres (5 % de chances par coffre). Ils changent l'aspect du héros, sans effet sur le jeu.

La sauvegarde est stockée dans le navigateur (`localStorage`). Elle est donc propre à chaque navigateur et à chaque appareil, et disparaît si les données du site sont effacées.

Pour la transporter ailleurs, le bouton 💾 du menu ouvre l'écran **Sauvegarde** : *Exporter* donne un code à copier ou un fichier à télécharger, *Importer* le relit (collé ou choisi comme fichier) et remplace la progression après confirmation. Le réglage du son reste celui de l'appareil.

## Version

La version du jeu (`0.x.y`) est écrite à un seul endroit, le champ `version` de `package.json`, et s'affiche en petit sous les boutons du menu (« v0.2.0 », avec « (dev) » en plus sous `npm run dev`). Elle est augmentée à chaque commit qui change le jeu : `feat` → version mineure (0.2.0 → 0.3.0), `fix` → correctif (0.2.0 → 0.2.1), rien pour la documentation, les tests ou la CI. Commande : `npm version minor --no-git-tag-version` (ou `patch`).

Chaque nouvelle version reçoit aussi un tag `vX.Y.Z` et une release GitHub (notes = message du commit), créés automatiquement par `.github/workflows/release.yml` au push sur `main`.

## Mode dev

Avec `npm run dev` uniquement (il n'existe pas dans la version publiée), un bouton **🛠 Dev** apparaît en haut à gauche du menu pour gagner du temps pendant les tests :

- **Niveau et temps de départ** : choisir le niveau (1 à 150) et le temps de survie (0 à 60 min) avant de lancer la partie, avec ou sans les améliorations d'un joueur de ce niveau, et trois préréglages (niveau 25, boss ×4, niveau 99). Les records de temps ne sont pas modifiés et l'or de fin de partie ne compte que le temps réellement joué.
- **Coffres à 1 pièce** : un coffre pour 1 pièce, trois pour 2 pièces. Cette option est indépendante de la précédente.

Les réglages sont conservés d'une session à l'autre, séparément de la sauvegarde du jeu.

## Mode debug (`?debug`)

Ajouter `?debug` à l'adresse du jeu l'active, dans la version publiée comme sous `npm run dev` : `http://localhost:5173/?debug`, ou `https://robin-delbos.github.io/slime_rush/?debug`. Sans ce paramètre, rien de tout cela n'existe. Sur téléphone : lancer `npm run dev:mobile` (voir « Tester sur téléphone ») puis ouvrir l'adresse `Network` suivie de `/?debug`. Une application installée sur l'écran d'accueil s'ouvre sans barre d'adresse : pour le mode debug, ouvrir le jeu dans le navigateur.

**Compteur de performances** : une petite ligne verte en bas à gauche, mise à jour chaque seconde, par exemple `30 i/s · résolution ×1.25 · 42 appels · 18 k triangles` :

| Valeur | Sens | Comment la lire |
|---|---|---|
| `i/s` | Images dessinées par seconde | La cadence plafonnée est de 30 sur mobile et de 60 sur PC en partie ; au menu principal 20 sur mobile et 30 sur PC ; 10 pendant la pause, le choix de niveau et les écrans qui cachent la 3D. Plus bas en pleine partie : l'appareil n'arrive pas à suivre. |
| `résolution ×` | Pixels dessinés par pixel de l'écran | Au maximum 1,5 sur mobile et 2 sur PC. Si elle baisse en jeu, l'ajustement automatique compense un appareil trop lent ; si elle reste au maximum avec la cadence plafonnée, l'appareil est à l'aise. |
| `appels` | Appels de dessin par image | Plus c'est bas, moins le processeur et le GPU travaillent. |
| `k triangles` | Milliers de triangles dessinés par image | Charge géométrique de la scène. |

Pour mesurer avant et après une modification : jouer une partie avancée (beaucoup d'ennemis) et noter ces valeurs. Les raccourcis ci-dessous aident à y arriver vite.

**Raccourcis dans la console** (`F12` sur PC) via `window.__game` : `state()` (état complet de la partie, dont `quality` : cadence, résolution, profil mobile ou PC), `setTime(secondes)` (avancer le temps de survie), `spawn(nombre, distance)` (faire apparaître des ennemis), `bringBosses(distance)` et `killBosses()`, `levelUp()` et `maxUpgrades()`, `fillSpecial()`, `legend()`, `kill()` (tuer le héros), `addGold(montant)` et `chestRandom([tirages])` (truquer le hasard des coffres). Ils servent aussi aux tests de bout en bout.

Pour profiler un vrai téléphone Android depuis le PC : activer le débogage USB, brancher le téléphone, ouvrir `chrome://inspect` dans Chrome sur le PC, puis inspecter la page du jeu (console, onglet Performance).

## Tests

| Commande | Rôle | Durée |
|---|---|---|
| `npm test` | Tests unitaires de la logique de jeu (sans navigateur) | ~5 s |
| `npm run test:watch` | Les mêmes, relancés à chaque modification | continu |
| `npm run test:e2e` | Compile le jeu puis le joue dans Chrome sans fenêtre, en format PC et mobile | ~2 min |
| `npm run test:e2e:mobile` | Joue au doigt sur quatre tailles de téléphone, à la verticale puis à l'horizontale, et fait pivoter l'appareil en pleine partie | ~1 min |
| `npm run test:e2e:texts` | Sur de petits écrans (320, 360 px, paysage) : aucun texte ne dépasse de son cadre ni de l'écran (armes, héros, amulettes, niveaux, coffres, pause, fin de partie), même avec de très grands nombres ; le cœur de la barre de vie ne recouvre pas les PV ; les cases d'armes et les quatre difficultés sont alignées | ~3 min |
| `npm run test:e2e:platforms` | Émule deux iPhone (dont un ancien, sans `AudioContext`) et deux Android : icônes identiques (pièce jaune, aucun emoji laissé au système), musique qui démarre au premier geste, partie au doigt, boss, coffre. Aussi l'installation (manifeste, icônes servies, service worker actif, lien « Installer l'application » : Android avec une fausse proposition de Chrome, iPhone avec son explication) et le plein écran et l'horizontal : Android verrouille l'horizontal en plein écran et le libère en sortant, iPhone affiche l'invitation à tourner et met la partie en pause (les API sont remplacées par des témoins, Chrome sans fenêtre ne passe pas vraiment en plein écran). Chrome fait tourner le tout : ce n'est pas un essai sur un vrai iPhone | ~1 min |
| `npm run test:all` | Types + tests unitaires + test de bout en bout | ~2 min |

À lancer avant de valider une modification : `npm test` pendant le développement, `npm run test:all` avant de considérer une fonctionnalité terminée.

**Tests unitaires** (`tests/*.test.ts`) : ils font tourner la simulation (`src/run.ts`) sans affichage, avec un aléatoire à graine fixe pour être reproductibles. Ils couvrent le héros, les ennemis, les armes, les objets à ramasser, les montées de niveau, la boutique, les armes, les difficultés, les apparences, la sauvegarde et la préparation des modèles 3D.

**Test de bout en bout** (`tests/e2e/run.mjs`) : il vérifie le parcours complet (menu, boutique, achat d'une apparence et d'une arme, choix de la difficulté, partie, montée de niveau, mort, retour au menu, sauvegarde conservée après rechargement) et échoue à la moindre erreur ou au moindre avertissement dans la console. Il pilote le Chrome installé sur le poste (Edge en secours), son coupé, sans dépendance supplémentaire. Les captures d'écran de chaque étape sont écrites dans `tests/e2e/output/`. Pour utiliser un autre navigateur, indiquez son chemin dans la variable d'environnement `BROWSER_PATH`.

Le mode `?debug` (voir « Mode debug ») expose `window.__game` (état, mort immédiate, ajout d'or), utilisé par ce test.

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
| `src/music.ts` | Musique de fond synthétisée (menu, partie, boss, ouverture des coffres) : notes en données pures + lecteur Web Audio |
| `src/emoji.ts` | Remplace les emojis du texte par des images Twemoji, pour des icônes identiques sur tous les appareils |
| `src/run.ts` | Simulation d'une partie, sans affichage (c'est elle que les tests font tourner) |
| `src/player.ts` | État et caractéristiques du héros |
| `src/enemies.ts` | Types d'ennemis et de boss, apparition, déplacement, affichage instancié |
| `src/weapons.ts` | Comportement des armes (projectiles, orbes, aura, lances) |
| `src/weaponData.ts` | Catalogue des armes : niveaux et valeurs, sans rendu |
| `src/pickups.ts` | Gemmes d'XP et pièces |
| `src/upgrades.ts` | Cartes de montée de niveau : bonus passifs et niveaux d'armes |
| `src/meta.ts` | Sauvegarde, boutique, armes à débloquer, apparences, difficultés |
| `src/chests.ts` | Contenu des coffres : prix, probabilités (et tableau affiché au joueur), tirage et rangement dans la sauvegarde |
| `src/credits.ts` | Ressources tierces et leurs licences, affichées à l'écran « Crédits et licences » |
| `src/amulets.ts` | Amulettes (effet pour une partie) |
| `src/cosmetics.ts` | Apparences à collectionner : projectiles, traînées, poussière |
| `src/assets.ts` | Chargement des modèles 3D |
| `src/bake.ts` | Conversion des animations en images fixes (voir ci-dessous) |
| `src/hero.ts` | Modèle animé du héros |
| `src/effects.ts` | Particules et textes flottants |
| `src/audio.ts` | Bruitages synthétisés (aucun fichier son) |
| `src/world.ts` | Scène, caméra, lumières, décor |
| `src/input.ts` | Clavier et joystick tactile |
| `src/screen.ts` | Plein écran et orientation, sans DOM : quel bouton selon l'appareil, entrée/sortie du plein écran, verrouillage de l'horizontal, invitation à tourner (iPhone) |
| `src/screenui.ts` | Relie `screen.ts` à la page : boutons, explication, écran « Tournez votre téléphone » |
| `src/quality.ts` | Économie d'énergie : qualité selon l'appareil, plafond d'images/s (`FrameLimiter`) et résolution automatique (`ResolutionScaler`), sans DOM |
| `src/grid.ts` | Grilles spatiales : séparation des ennemis (`SeparationGrid`, avec la méthode d'origine en référence) et recherches des armes (`SpatialIndex`) |
| `src/update.ts`, `src/updateui.ts` | Détection d'une nouvelle version publiée (comparaison avec `version.json`) et bandeau « Actualiser » |
| `src/ui.ts` | Interface HTML |
| `src/rng.ts` | Aléatoire de la simulation, remplaçable par une graine fixe |
| `public/models/` | Modèles 3D (format GLB) |
| `public/manifest.webmanifest`, `sw.js`, `icon*.svg`, `icon-*.png`, `apple-touch-icon.png` | Installation comme application : manifeste (plein écran, horizontal), service worker (copie hors connexion), icônes (dessinées à partir du logo du jeu ; `icon-maskable-512.png` est la variante découpable d'Android). Les PNG se refont à partir des SVG par une capture Chrome sans fenêtre |
| `public/confidentialite.html` | Politique de confidentialité (page autonome, liée depuis l'écran des crédits) : à mettre à jour avant d'ajouter publicité, achats ou toute collecte de données |
| `LICENSE` | Licence du dépôt (tous droits réservés, ressources tierces sous leur propre licence) |

### Ajouter du contenu

- **Bonus passif en partie** : une entrée dans `PASSIVES` (`src/upgrades.ts`).
- **Arme** : ses 6 niveaux dans `WEAPONS` (`src/weaponData.ts`) et son comportement dans `src/weapons.ts`. Le test « Données des armes » vérifie que chaque niveau apporte quelque chose.
- **Difficulté** : une entrée dans `DIFFICULTIES` (`src/meta.ts`).
- **Amulette** : une entrée dans `AMULETS` (`src/amulets.ts`) ; **apparence** : une entrée dans `COSMETICS` (`src/cosmetics.ts`) ; **arme de coffre** : une arme avec `chest: true` dans `WEAPONS`.
- **Boss** : un type avec `boss: true` dans `DEFS` (`src/enemies.ts`) ; la cadence et le plafond sont dans `src/run.ts` (`BOSS_INTERVAL`, `MAX_BOSSES`).
- **Amélioration permanente** : une entrée dans `SHOP_ITEMS` (`src/meta.ts`).
- **Héros** : une entrée dans `CHARACTERS` (`src/meta.ts`) et son modèle dans `public/models/`. Le modèle doit contenir des animations nommées `Idle`, `Run` (ou `Running`) et `Death`. Les modèles doivent avoir le même style que les autres (personnages cartoon, grosse tête). Pour l'alléger et retirer l'arme tenue en main, utiliser `tools/slim-glb.cjs` (usage en tête du fichier). Chaque nouveau héros coûte un peu plus cher que le précédent ; avec `chest: true` (et `cost: 0`), il ne s'achète pas et sort des coffres (`CHEST_ODDS.character` dans `src/chests.ts`).
- **Ennemi** : une entrée dans `DEFS` (`src/enemies.ts`), et son modèle dans `ENEMY_MODELS` (`src/assets.ts`).

### Comment des centaines d'ennemis animés restent fluides

Three.js ne sait pas afficher en un seul appel des centaines de modèles animés par squelette. Au chargement, `src/bake.ts` calcule donc la forme de chaque ennemi à 12 instants de son animation de marche. Chaque image devient un maillage instancié, et chaque ennemi est rangé à chaque instant dans l'image qui correspond à son avancement. Résultat : au plus 12 appels de dessin par type d'ennemi, quel que soit leur nombre.

Si un modèle ne se charge pas, il est remplacé par une forme simple et le jeu reste jouable.

## Crédits

Le jeu les affiche aussi à l'écran **Crédits et licences** (lien sous les boutons du menu, avec la [politique de confidentialité](public/confidentialite.html)), car les licences CC BY 4.0 (Twemoji) et MIT (three.js) exigent que la mention soit visible dans le jeu publié, pas seulement dans ce dépôt. Toute nouvelle ressource tierce (modèle, police, bibliothèque...) s'ajoute à la fois ici et dans `src/credits.ts`.

Modèles 3D de [Quaternius](https://quaternius.com/), sous licence [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (domaine public), récupérés sur [poly.pizza](https://poly.pizza/u/Quaternius) :

| Fichier | Modèle d'origine |
|---|---|
| `hero-pip.glb` | Animated Platformer Character |
| `hero-bolt.glb` | Animated Robot |
| `hero-ombre.glb` | Character Animated |
| `hero-anne.glb` | Anne (arme retirée, allégé : trois animations) |
| `hero-sam.glb` | Characters Sam (arme retirée, allégé : trois animations) |
| `hero-pirate.glb` | Pirate Captain (sabre retiré, allégé : trois animations) |
| `hero-lis.glb` | Lis (pistolet retiré, allégé : trois animations) |
| `hero-matt.glb` | Characters Matt (couteau retiré, allégé : trois animations) |
| `slime.glb` | Slime Enemy |
| `bat.glb` | Bat |
| `orc.glb` | Orc Enemy |
| `skull.glb` | Skull Enemy |

Icônes (pièces, crâne, cadeau, etc.) : [Twemoji](https://github.com/jdecked/twemoji), graphismes sous licence [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/), copiés dans `public/emoji/`. Elles remplacent les emojis du système pour que le jeu soit identique sur iOS, Android et PC (voir `src/emoji.ts`).
