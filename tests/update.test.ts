import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import gameSource from '../src/game.ts?raw';
import updateUiSource from '../src/updateui.ts?raw';
import viteConfig from '../vite.config.ts?raw';
import { UpdateWatcher, parseVersion } from '../src/update';

describe('lecture de version.json', () => {
  it('accepte le contenu écrit par le build', () => {
    expect(parseVersion({ version: '0.8.0' })).toBe('0.8.0');
  });

  it('refuse tout ce qui n’a pas la bonne forme (page d’erreur, fichier absent, texte)', () => {
    for (const bad of [null, undefined, 'v0.8.0', 42, {}, { version: 8 }, { version: '' }, { version: 'abc' }, [], '<html>404</html>']) {
      expect(parseVersion(bad)).toBeNull();
    }
  });
});

describe('détection d’une nouvelle version', () => {
  it('ne signale rien quand le serveur a la même version', async () => {
    const watcher = new UpdateWatcher('0.8.0', async () => ({ version: '0.8.0' }));
    expect(await watcher.check()).toBe(false);
    expect(watcher.available).toBe(false);
  });

  it('signale une version différente, une seule fois', async () => {
    let changes = 0;
    const watcher = new UpdateWatcher('0.8.0', async () => ({ version: '0.9.0' }));
    watcher.onChange = () => changes++;
    expect(await watcher.check()).toBe(true);
    expect(await watcher.check()).toBe(true);
    expect(watcher.available).toBe(true);
    expect(changes).toBe(1);
  });

  it('une mise à jour déjà signalée ne disparaît pas, même si le serveur ne répond plus', async () => {
    let online = true;
    const watcher = new UpdateWatcher('0.8.0', async () => {
      if (!online) throw new TypeError('Failed to fetch');
      return { version: '0.8.1' };
    });
    await watcher.check();
    online = false;
    expect(await watcher.check()).toBe(true);
  });

  it('hors connexion ou fichier illisible : rien ne change et rien ne plante', async () => {
    const offline = new UpdateWatcher('0.8.0', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await offline.check()).toBe(false);
    for (const answer of [null, '<html>404</html>', { version: 'n’importe quoi' }, {}]) {
      const watcher = new UpdateWatcher('0.8.0', async () => answer);
      expect(await watcher.check()).toBe(false);
    }
  });

  it('une version publiée plus ancienne (retour en arrière) est aussi signalée : le joueur doit recharger', async () => {
    const watcher = new UpdateWatcher('0.9.0', async () => ({ version: '0.8.0' }));
    expect(await watcher.check()).toBe(true);
  });

  it('réessaie à la vérification suivante après un échec', async () => {
    let calls = 0;
    const watcher = new UpdateWatcher('0.8.0', async () => {
      if (++calls === 1) throw new TypeError('Failed to fetch');
      return { version: '0.8.1' };
    });
    expect(await watcher.check()).toBe(false);
    expect(await watcher.check()).toBe(true);
  });
});

describe('bandeau « Nouvelle version disponible »', () => {
  it('le build écrit version.json avec la version de package.json', () => {
    expect(viteConfig).toContain("fileName: 'version.json'");
    expect(viteConfig).toContain('JSON.stringify({ version })');
  });

  it('la page a le bandeau et son bouton « Actualiser »', () => {
    expect(indexHtml).toContain('id="update-bar"');
    expect(indexHtml).toMatch(/id="btn-update"[^>]*>Actualiser</);
  });

  it('le bouton recharge la page', () => {
    expect(updateUiSource).toMatch(/btn-update[\s\S]*window\.location\.reload\(\)/);
  });

  it('la vérification lit version.json sans cache et seulement dans la version publiée', () => {
    expect(updateUiSource).toContain("fetch('./version.json', { cache: 'no-store' })");
    expect(updateUiSource).toContain('import.meta.env.PROD');
  });

  it('le jeu ne montre le bandeau qu’au menu et en fin de partie : jamais en jeu, ni en pause (recharger perdrait la partie)', () => {
    expect(gameSource).toContain("this.updates.show(this.updates.available && (this.state === 'menu' || this.state === 'gameover'))");
  });
});
