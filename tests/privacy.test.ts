import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import manifestText from '../public/manifest.webmanifest?raw';
import privacyPage from '../public/confidentialite.html?raw';
import uiSource from '../src/ui.ts?raw';

describe('Politique de confidentialité dans l’application installée', () => {
  it('s’ouvre dans le jeu par un bouton : un lien vers sa page sortirait du jeu (champ de l’application), et la fermer fermerait l’application', () => {
    expect(indexHtml).toContain('id="btn-privacy"');
    expect(indexHtml).toMatch(/<button id="btn-privacy"/);
    // Aucun lien (a) vers la page : seulement l'écran dans le jeu.
    expect(indexHtml).not.toMatch(/<a[^>]*confidentialite\.html/);
    expect(indexHtml).not.toContain('id="credits-privacy"');
  });

  it('a son écran dans le jeu : un cadre vers la page et un bouton Retour', () => {
    expect(indexHtml).toContain('id="overlay-privacy"');
    expect(indexHtml).toMatch(/<iframe id="privacy-frame"[^>]*data-src="\.\/confidentialite\.html"/);
    expect(indexHtml).toContain('id="btn-privacy-back"');
  });

  it('charge la page à la première ouverture seulement, sans jamais quitter le jeu', () => {
    expect(uiSource).toContain("if (!frame.getAttribute('src')) frame.src =");
    // Aucune navigation, aucun nouvel onglet ni nouvelle fenêtre depuis ce code.
    const code = uiSource.slice(uiSource.indexOf("const privacy = el('overlay-privacy')"), uiSource.indexOf("el('btn-privacy-back')") + 220);
    expect(code).not.toMatch(/window\.open|location\.(href|assign|replace)/);
  });

  it('la page autonome existe toujours (adresse directe, boutiques d’applications)', () => {
    expect(privacyPage).toContain('Politique de confidentialité');
    expect(privacyPage).toContain('ne collecte aucune donnée personnelle');
  });

  it('la page de confidentialité est dans le champ de l’application installée : c’est pourquoi un lien y mènerait dans la fenêtre du jeu', () => {
    const manifest = JSON.parse(manifestText) as { scope: string; start_url: string };
    expect(manifest.scope).toBe('./');
    expect(manifest.start_url).toBe('./');
  });
});
