import { describe, expect, it } from 'vitest';
import { CREDITS, THREE_LICENSE } from '../src/credits';
import { EMOJI_CODES } from '../src/emoji';
import privacyPage from '../public/confidentialite.html?raw';
import licenseFile from '../LICENSE?raw';

describe('Crédits et licences', () => {
  const find = (name: string) => CREDITS.find((c) => c.name.toLowerCase().includes(name.toLowerCase()));

  it('cite chaque ressource tierce avec sa licence, comme l’exigent CC BY 4.0 et MIT', () => {
    expect(find('Quaternius')?.license).toContain('CC0');
    expect(find('Twemoji')?.license).toBe('CC BY 4.0');
    expect(find('Twemoji')?.author).toMatch(/Twitter/);
    expect(find('three.js')?.license).toContain('MIT');
    // Les sons et la musique sont synthétisés par le jeu : aucune ressource tierce à créditer.
    expect(find('Créés pour le jeu')?.license).toBe('Œuvre originale');
  });

  it('crédite les icônes dès que le jeu en embarque', () => {
    expect(EMOJI_CODES.length).toBeGreaterThan(0);
    expect(find('Twemoji')).toBeDefined();
  });

  it('remplit toutes les informations, avec des liens sécurisés', () => {
    for (const c of CREDITS) {
      for (const field of [c.what, c.name, c.author, c.license]) expect(field.trim().length, c.name).toBeGreaterThan(0);
      for (const url of [c.licenseUrl, c.sourceUrl].filter((u): u is string => !!u)) expect(url, c.name).toMatch(/^https:\/\//);
      // Un lien de source sans libellé afficherait toute l'adresse.
      if (c.sourceUrl) expect(c.sourceLabel?.length ?? 0, c.name).toBeGreaterThan(0);
    }
  });

  it('ne met aucun nom de personne ni lien vers le dépôt dans les crédits', () => {
    const text = JSON.stringify(CREDITS);
    expect(text).not.toMatch(/Delbos|Robin/i);
    expect(text).not.toContain('github.com/Robin');
  });

  it('embarque le texte complet de la licence MIT de three.js, tel qu’installé', () => {
    expect(THREE_LICENSE).toContain('The MIT License');
    expect(THREE_LICENSE).toMatch(/Copyright .*three\.js authors/);
    expect(THREE_LICENSE).toContain('Permission is hereby granted, free of charge');
    expect(THREE_LICENSE).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
  });

  it('crédite chaque modèle 3D livré avec le jeu (au moins les fichiers de héros et d’ennemis)', () => {
    const models = Object.keys(import.meta.glob('../public/models/*.glb')).map((path) => path.split('/').pop());
    expect(models.length).toBeGreaterThanOrEqual(12);
    // Tous viennent de Quaternius : s'il arrive un modèle d'une autre source, il faut l'ajouter à CREDITS.
    expect(CREDITS.filter((c) => c.what.includes('modèles 3D')).length).toBe(1);
  });
});

describe('Politique de confidentialité et licence du dépôt', () => {
  it('annonce que le jeu ne collecte rien, et dit où est la sauvegarde', () => {
    expect(privacyPage).toContain('ne collecte aucune donnée personnelle');
    expect(privacyPage).toContain('slime-rush.save');
    expect(privacyPage).toMatch(/aucune publicité/);
    expect(privacyPage).toMatch(/mise à jour le \d+ \w+ \d{4}/);
  });

  it('est autonome : aucun script ni ressource externe chargés par la page', () => {
    expect(privacyPage).not.toMatch(/<script/i);
    expect(privacyPage).not.toMatch(/<(img|link|iframe)[^>]+(src|href)="https?:/i);
  });

  it('ne contient ni nom de personne ni adresse électronique', () => {
    expect(privacyPage).not.toMatch(/@[\w-]+\.\w+/);
    expect(privacyPage).not.toMatch(/Delbos\b(?!\/)/);
  });

  it('le dépôt a sa licence, qui réserve les droits et laisse les ressources tierces à leur licence', () => {
    expect(licenseFile).toContain('Tous droits réservés');
    for (const word of ['Quaternius', 'CC0', 'Twemoji', 'CC BY 4.0', 'three.js', 'MIT']) expect(licenseFile).toContain(word);
  });
});
