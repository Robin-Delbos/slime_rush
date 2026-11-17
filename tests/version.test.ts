import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import packageJson from '../package.json?raw';
import gameSource from '../src/game.ts?raw';
import metaSource from '../src/meta.ts?raw';
import uiSource from '../src/ui.ts?raw';
import { APP_VERSION, VERSION_LABEL, versionLabel } from '../src/version';

describe('Version du jeu', () => {
  it('est celle de package.json, la source unique', () => {
    const { version } = JSON.parse(packageJson) as { version: string };
    expect(APP_VERSION).toBe(version);
  });

  it('a le format 0.x.y (trois nombres)', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('s’affiche sous la forme « v0.x.y », avec « (dev) » en développement seulement', () => {
    expect(versionLabel('0.2.0', false)).toBe('v0.2.0');
    expect(versionLabel('0.2.0', true)).toBe('v0.2.0 (dev)');
    expect(VERSION_LABEL.startsWith(`v${APP_VERSION}`)).toBe(true);
  });

  it('a un emplacement dans le menu, rempli par l’interface', () => {
    expect(indexHtml).toContain('id="version"');
    expect(uiSource).toContain('VERSION_LABEL');
  });

  it('n’est écrite nulle part ailleurs en dur : ni dans le code du jeu ni dans la page', () => {
    const files: Record<string, string> = { 'index.html': indexHtml, 'src/ui.ts': uiSource, 'src/game.ts': gameSource, 'src/meta.ts': metaSource };
    for (const [file, text] of Object.entries(files)) {
      for (const literal of [`'${APP_VERSION}'`, `"${APP_VERSION}"`, `v${APP_VERSION}`]) {
        expect(text, `${file} : ${literal}`).not.toContain(literal);
      }
    }
  });

  it('n’est pas confondue avec la version du format de sauvegarde', () => {
    // La sauvegarde a sa propre version (un entier) : elle ne change pas à chaque version du jeu.
    expect(metaSource).toContain('version: 1');
  });
});
