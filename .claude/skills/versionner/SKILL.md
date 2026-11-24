---
name: versionner
description: Règles de numérotation de la version de Slime Rush, affichée au menu du jeu. À appliquer avant chaque commit/push de ce projet (et donc depuis /commit-fr) pour décider s'il faut augmenter la version, laquelle, et comment. À consulter aussi quand l'utilisateur parle de la version du jeu, de numéro de version ou de release.
---

# Versionner Slime Rush

La version du jeu est un numéro `0.x.y` affiché en petit sous les boutons du menu (« v0.2.0 », avec « (dev) » en plus sous `npm run dev`). Elle permet à l'utilisateur et à ses testeurs de savoir quelle version du jeu ils ont sous les yeux (par exemple sur GitHub Pages après une publication).

## Où elle vit

- **Une seule source : le champ `version` de `package.json`.** Ne l'écrire nulle part d'autre.
- `vite.config.ts` la transmet au code sous le nom `__APP_VERSION__` ; `src/version.ts` la lit (`APP_VERSION`, `VERSION_LABEL`) ; `src/ui.ts` l'affiche dans `#version` (emplacement dans `index.html`).
- À ne pas confondre avec `version: 1` dans `src/meta.ts` : c'est la version du **format de sauvegarde**, qui ne change que si ce format change.
- `tests/version.test.ts` vérifie que l'affichage suit `package.json`, que le format est `x.y.z` et qu'aucun fichier ne contient le numéro en dur.

## Quand l'augmenter

À décider **à chaque commit/push**, d'après le type du commit (voir `commit-fr`) :

| Type du commit | Effet sur le jeu publié | Version |
|---|---|---|
| `feat` | Nouveauté visible pour le joueur (arme, écran, mécanique, contenu) | **mineure** : 0.2.0 → 0.3.0 |
| `fix` | Correction d'un défaut du jeu | **correctif** : 0.2.0 → 0.2.1 |
| `refactor` / `perf` | Seulement s'ils changent un comportement visible ; sinon rien | correctif, ou rien |
| `docs`, `test`, `chore`, `ci`, `style` | Le jeu publié ne change pas | **aucune** |

- Un commit qui mélange nouveauté et correctif prend la version **mineure**.
- Le **majeur** (`1.0.0`) n'est jamais augmenté sans que l'utilisateur le demande : c'est un choix de communication (sortie officielle).
- En cas de doute entre « rien » et « correctif », choisir « rien » pour une modification qui n'est pas visible dans le jeu.

## Comment

1. Vérifier qu'elle n'a **pas déjà été augmentée** pour ce commit : comparer `package.json` avec `git show HEAD:package.json`. Si le numéro diffère déjà, ne pas l'augmenter une seconde fois.
2. Augmenter sans créer de tag ni de commit : `npm version minor --no-git-tag-version` (ou `patch`). Cela met à jour `package.json` **et** `package-lock.json` ; les deux fichiers font partie du commit.
3. Faire cela **avant** le lancement des tests complets, pour que les tests et la compilation portent déjà la nouvelle version.
4. Ajouter l'entrée de la nouvelle version **en premier** dans `src/changelog.ts` (journal des nouveautés du menu), en ne disant que ce qui sert au joueur ; `tests/changelog.test.ts` échoue si elle manque.
5. Le message de commit n'a pas besoin d'une ligne dédiée, mais si la version change, ajouter dans le corps une ligne « Version : 0.x.y ».
6. Après le push, **vérifier que le tag et la release existent** (voir ci-dessous) et le dire dans le compte rendu.
7. Dans le compte rendu à l'utilisateur, **annoncer la version** (ancienne → nouvelle) ou dire qu'elle n'a pas changé, et pourquoi.

## Tag et release

Chaque nouvelle version a un tag `vX.Y.Z` et une release GitHub « Slime Rush X.Y.Z », rattachés au commit qui a changé la version (demandé par l'utilisateur, durablement : pas besoin de redemander).

- **C'est le workflow `.github/workflows/release.yml` qui les crée**, au push sur `main` : si `package.json` porte une version sans release, il crée le tag et la release sur le commit qui a changé la ligne `version`, avec le message de ce commit comme notes (sans la ligne `Co-Authored-By`). Aucune action manuelle, aucun jeton à manipuler : le poste de l'utilisateur n'a pas `gh`, et il ne faut pas extraire ses identifiants Git pour appeler l'API.
- **Ne pas créer le tag à la main avant le push** : le workflow le ferait échouer ou l'ignorerait. Et ne pas pousser de tag sans release.
- Donc **pour une version, le message du commit compte** : ses notes deviennent celles de la release. Titre clair, corps en puces sur ce qui change pour le joueur (voir `commit-fr`).
- **Vérification après le push** (dépôt public, sans identifiant) : attendre une trentaine de secondes puis `curl -s https://api.github.com/repos/Robin-Delbos/slime_rush/releases/latest` ; le `tag_name` doit être `vX.Y.Z` et `target_commitish`/le tag pointer sur le bon commit. S'il n'y est pas, regarder `https://api.github.com/repos/Robin-Delbos/slime_rush/actions/runs?per_page=3` (statut du workflow « Release de la version ») et le dire à l'utilisateur plutôt que de contourner.
- Un commit sans changement de version (docs, tests, ci...) ne crée ni tag ni release.

## Ne pas faire

- Ne pas écrire le numéro à la main dans `index.html`, le code ou le README (le README décrit la règle, sans le numéro en cours).
- Ne pas créer ni supprimer de tag ou de release à la main, ni réécrire un tag existant (déplacer un tag publié casse les liens des testeurs).
- Ne pas augmenter la version pour un commit qui ne touche que la documentation, les tests ou la CI.
