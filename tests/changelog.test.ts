import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import uiSource from '../src/ui.ts?raw';
import { CHANGE_LABELS, CHANGELOG, formatReleaseDate } from '../src/changelog';
import { APP_VERSION } from '../src/version';

const parts = (version: string) => version.split('.').map(Number);

describe('Journal des nouveautés', () => {
  it('commence par la version en cours : chaque nouvelle version ajoute son entrée', () => {
    expect(CHANGELOG[0].version).toBe(APP_VERSION);
  });

  it('va de la plus récente à la plus ancienne, sans doublon, en numéros x.y.z', () => {
    const versions = CHANGELOG.map((release) => release.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (const version of versions) expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    for (let i = 1; i < versions.length; i++) {
      const [a, b] = [parts(versions[i - 1]), parts(versions[i])];
      const newer = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
      expect(newer, `${versions[i - 1]} avant ${versions[i]}`).toBeGreaterThan(0);
    }
  });

  it('date chaque version d’un jour valide, jamais plus ancien que la version précédente', () => {
    for (const release of CHANGELOG) expect(release.date).toMatch(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
    for (let i = 1; i < CHANGELOG.length; i++) expect(CHANGELOG[i - 1].date >= CHANGELOG[i].date).toBe(true);
  });

  it('donne à chaque version au moins une ligne, d’un type connu, rédigée pour le joueur', () => {
    for (const release of CHANGELOG) {
      expect(release.changes.length, release.version).toBeGreaterThan(0);
      for (const change of release.changes) {
        expect(Object.keys(CHANGE_LABELS)).toContain(change.kind);
        expect(change.text.length, `${release.version} : ${change.text}`).toBeGreaterThan(15);
        expect(change.text.trim().endsWith('.'), `${release.version} : le texte finit par un point`).toBe(true);
        // Du vocabulaire de développeur n'a rien à faire dans ce que lit le joueur.
        expect(change.text, release.version).not.toMatch(/\b(refactor|vitest|e2e|TypeScript|commit|workflow|CI)\b/i);
      }
    }
  });

  it('écrit la date en français', () => {
    expect(formatReleaseDate('2026-11-21')).toBe('21 novembre 2026');
    expect(formatReleaseDate('2026-01-05')).toBe('5 janvier 2026');
    expect(formatReleaseDate('2026-12-31')).toBe('31 décembre 2026');
    expect(formatReleaseDate('pas une date')).toBe('pas une date');
  });
});

describe('Journal des nouveautés dans le jeu', () => {
  it('s’ouvre en touchant la version du menu (un bouton) et se ferme par Retour', () => {
    expect(indexHtml).toMatch(/<button id="version"/);
    expect(indexHtml).toContain('id="overlay-changelog"');
    expect(indexHtml).toContain('id="changelog-list"');
    expect(indexHtml).toContain('id="btn-changelog-back"');
    expect(uiSource).toContain("el('version').addEventListener('click'");
  });

  it('cache le menu quand il est ouvert, et se referme avec les autres écrans', () => {
    // Même traitement que les crédits : il couvre le menu, la 3D n'a plus à tourner à pleine cadence, et il se ferme avec le reste.
    expect(uiSource).toContain('[this.shop, this.saveScreen, this.credits, this.changelog, this.collection].some');
    expect(uiSource).toContain('[this.shop, this.saveScreen, this.credits, this.changelog, this.reveal].some');
    expect(uiSource).toContain('this.credits, this.changelog, this.collection, this.levelUp');
  });
});
