import { describe, expect, it } from 'vitest';
import enemiesSource from '../src/enemies.ts?raw';
import gameSource from '../src/game.ts?raw';
import uiSource from '../src/ui.ts?raw';
import worldSource from '../src/world.ts?raw';
import { FrameLimiter, MIN_PIXEL_RATIO, ResolutionScaler, isMobileDevice, qualityFor } from '../src/quality';

const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const PC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

describe('qualité choisie selon l’appareil', () => {
  it('mobile : 30 images/s, résolution plafonnée à 1,5, ombres allégées, pas d’anticrénelage sur écran dense', () => {
    const q = qualityFor({ mobile: true, devicePixelRatio: 3 });
    expect(q.maxFps).toBe(30);
    expect(q.menuFps).toBe(20);
    expect(q.maxPixelRatio).toBe(1.5);
    expect(q.shadowMapSize).toBe(1024);
    expect(q.antialias).toBe(false);
    expect(q.anisotropy).toBe(2);
  });

  it('PC : 60 images/s, résolution jusqu’à 2', () => {
    const q = qualityFor({ mobile: false, devicePixelRatio: 2 });
    expect(q.maxFps).toBe(60);
    expect(q.menuFps).toBe(30);
    expect(q.maxPixelRatio).toBe(2);
    expect(q.shadowMapSize).toBe(2048);
    expect(q.antialias).toBe(false);
    expect(q.anisotropy).toBe(4);
  });

  it('écran de densité 1 : jamais plus de pixels que l’écran, et anticrénelage gardé (le crénelage s’y voit)', () => {
    for (const mobile of [true, false]) {
      const q = qualityFor({ mobile, devicePixelRatio: 1 });
      expect(q.maxPixelRatio).toBe(1);
      expect(q.antialias).toBe(true);
    }
  });

  it('une densité absente ou absurde ne casse rien', () => {
    expect(qualityFor({ mobile: false, devicePixelRatio: 0 }).maxPixelRatio).toBe(1);
    expect(qualityFor({ mobile: false, devicePixelRatio: Number.NaN }).maxPixelRatio).toBe(1);
  });

  it('le menu principal est plus lent que le jeu mais plus vif qu’une scène figée', () => {
    for (const mobile of [true, false]) {
      const q = qualityFor({ mobile, devicePixelRatio: 2 });
      expect(q.menuFps).toBeLessThan(q.maxFps);
      expect(q.menuFps).toBeGreaterThan(q.frozenFps);
    }
  });

  it('une scène figée (pause) est redessinée beaucoup moins souvent que le jeu', () => {
    const q = qualityFor({ mobile: false, devicePixelRatio: 1 });
    expect(q.frozenFps).toBeLessThan(q.maxFps / 2);
  });

  it('la résolution plancher ne dépasse jamais la résolution maximale', () => {
    const q = qualityFor({ mobile: true, devicePixelRatio: 1 });
    expect(q.minPixelRatio).toBe(MIN_PIXEL_RATIO);
    expect(q.minPixelRatio).toBeLessThanOrEqual(q.maxPixelRatio);
  });

  it('reconnaît un mobile par son pointeur tactile ou son identité', () => {
    expect(isMobileDevice(PHONE_UA, false)).toBe(true);
    expect(isMobileDevice(PC_UA, true)).toBe(true);
    expect(isMobileDevice(PC_UA, false)).toBe(false);
  });
});

/** Joue `seconds` secondes d'un écran qui donne un top toutes les `1000 / hz` ms, et compte les images dessinées. */
function render(limiter: FrameLimiter, hz: number, seconds: number, jitter = 0): { count: number; times: number[] } {
  const times: number[] = [];
  const period = 1000 / hz;
  const frames = Math.floor(seconds * hz);
  for (let n = 0; n < frames; n++) {
    const t = 1000 + n * period + (jitter ? Math.sin(n * 12.9898) * jitter : 0);
    if (limiter.shouldRender(t)) times.push(t);
  }
  return { count: times.length, times };
}

describe('plafonnement de la fréquence d’images', () => {
  it.each([
    [60, 30, 30],
    [90, 30, 30],
    [120, 30, 30],
    [120, 60, 60],
    [144, 60, 60],
    [60, 60, 60],
    [60, 10, 10],
    [60, 20, 20],
    [120, 30, 30],
  ])('écran %i Hz plafonné à %i images/s : environ %i images dessinées par seconde', (hz, fps, expected) => {
    const { count } = render(new FrameLimiter(fps), hz, 10);
    expect(count / 10).toBeGreaterThanOrEqual(expected - 1.5);
    expect(count / 10).toBeLessThanOrEqual(expected + 0.5);
  });

  it('ne dépasse jamais la cadence demandée, même avec la gigue d’un écran réel', () => {
    for (const [hz, fps] of [[60, 30], [120, 60], [144, 60], [90, 30]] as const) {
      const { count } = render(new FrameLimiter(fps), hz, 20, 1.2);
      expect(count / 20).toBeLessThanOrEqual(fps + 0.5);
      expect(count / 20).toBeGreaterThanOrEqual(fps * 0.9);
    }
  });

  it('les images sont régulièrement espacées (pas de rafales)', () => {
    const { times } = render(new FrameLimiter(30), 60, 5);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    expect(Math.max(...gaps)).toBeLessThan(40);
    expect(Math.min(...gaps)).toBeGreaterThan(25);
  });

  it('après une longue pause (onglet caché), repart tout de suite sans rafale de rattrapage', () => {
    const limiter = new FrameLimiter(30);
    expect(limiter.shouldRender(1000)).toBe(true);
    expect(limiter.shouldRender(60000)).toBe(true);
    // Les tops suivants à 60 Hz : une image sur deux, comme avant la pause.
    expect(limiter.shouldRender(60016.7)).toBe(false);
    expect(limiter.shouldRender(60033.3)).toBe(true);
    expect(limiter.shouldRender(60050)).toBe(false);
  });

  it('un changement de cadence (fin de pause) redessine tout de suite', () => {
    const limiter = new FrameLimiter(10);
    limiter.shouldRender(1000);
    limiter.setFps(30);
    expect(limiter.fps).toBe(30);
    expect(limiter.shouldRender(1016)).toBe(true);
  });
});

/** Envoie `frames` images durant chacune `ms` millisecondes ; renvoie les résolutions annoncées au fil de l'eau. */
function feed(scaler: ResolutionScaler, frames: number, ms: number): number[] {
  const changes: number[] = [];
  for (let i = 0; i < frames; i++) {
    const ratio = scaler.record(ms);
    if (ratio !== null) changes.push(ratio);
  }
  return changes;
}

describe('ajustement automatique de la résolution', () => {
  const TARGET = 1000 / 30;

  it('démarre à la résolution maximale et n’y touche pas tant que l’appareil tient la cadence', () => {
    const scaler = new ResolutionScaler(0.75, 1.5, TARGET);
    expect(scaler.ratio).toBe(1.5);
    expect(feed(scaler, 2000, TARGET)).toEqual([]);
    expect(scaler.ratio).toBe(1.5);
  });

  it('baisse la résolution par paliers quand les images sont trop lentes', () => {
    const scaler = new ResolutionScaler(0.75, 1.5, TARGET);
    const changes = feed(scaler, 20 * 3, TARGET * 1.6);
    expect(changes).toHaveLength(3);
    expect(changes[0]).toBeLessThan(1.5);
    expect(changes[1]).toBeLessThan(changes[0]);
    expect(changes[2]).toBeLessThan(changes[1]);
  });

  it('ne descend jamais sous le plancher, ni ne monte au-dessus du plafond', () => {
    const scaler = new ResolutionScaler(0.75, 1.5, TARGET);
    const down = feed(scaler, 20 * 40, TARGET * 3);
    expect(Math.min(...down)).toBe(0.75);
    expect(scaler.ratio).toBe(0.75);
    const up = feed(scaler, 20 * 64 * 20, TARGET);
    expect(Math.max(...up)).toBeLessThanOrEqual(1.5);
    expect(scaler.ratio).toBeLessThanOrEqual(1.5);
  });

  it('remonte la résolution, doucement, une fois la cadence tenue longtemps', () => {
    const scaler = new ResolutionScaler(0.75, 1.5, TARGET);
    feed(scaler, 20 * 6, TARGET * 2);
    const low = scaler.ratio;
    expect(low).toBeLessThan(1.5);
    // Pas tout de suite : il faut de la patience (8 fenêtres tenues, soit environ 5 secondes à 30 images/s).
    expect(feed(scaler, 20 * 7, TARGET)).toEqual([]);
    const changes = feed(scaler, 20 * 40, TARGET);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0]).toBeGreaterThan(low);
    expect(changes[0]).toBeLessThanOrEqual(low * 1.2);
  });

  it('un à-coup isolé (ramasse-miettes, notification) ne fait pas baisser la résolution', () => {
    const scaler = new ResolutionScaler(0.75, 1.5, TARGET);
    for (let window = 0; window < 50; window++) {
      feed(scaler, 19, TARGET);
      expect(scaler.record(800)).toBeNull();
    }
    expect(scaler.ratio).toBe(1.5);
  });

  it('une cadence moyenne (ni lente ni tenue) laisse la résolution en place', () => {
    const scaler = new ResolutionScaler(0.75, 1.5, TARGET);
    feed(scaler, 20 * 6, TARGET * 2);
    const ratio = scaler.ratio;
    expect(feed(scaler, 20 * 200, TARGET * 1.2)).toEqual([]);
    expect(scaler.ratio).toBe(ratio);
  });

  it('si une remontée fait aussitôt rechuter, la patience avant la suivante double (pas d’oscillation)', () => {
    const scaler = new ResolutionScaler(0.75, 1.5, TARGET);
    /** Nombre de fenêtres tenues avant la remontée suivante. */
    const windowsBeforeRise = (): number => {
      for (let windows = 1; windows < 500; windows++) {
        for (let i = 0; i < 20; i++) if (scaler.record(TARGET) !== null) return windows;
      }
      return Infinity;
    };
    feed(scaler, 20 * 3, TARGET * 2);
    const first = windowsBeforeRise();
    // La remontée est mauvaise : on rechute.
    feed(scaler, 20, TARGET * 2);
    const second = windowsBeforeRise();
    expect(second).toBeGreaterThanOrEqual(first * 2);
  });

  it('un changement de cadence visée repart d’une mesure neuve', () => {
    const scaler = new ResolutionScaler(0.75, 1.5, TARGET);
    feed(scaler, 19, TARGET * 3);
    scaler.setTarget(1000 / 60);
    // Les 19 mauvaises images sont oubliées : une seule image tenue ne déclenche rien.
    expect(scaler.record(1000 / 60)).toBeNull();
    expect(scaler.ratio).toBe(1.5);
  });

  it('un plancher supérieur au plafond (écran de densité 0,5) ne casse rien', () => {
    const scaler = new ResolutionScaler(0.75, 0.5, TARGET);
    expect(scaler.ratio).toBe(0.5);
    feed(scaler, 20 * 10, TARGET * 3);
    expect(scaler.ratio).toBe(0.5);
  });
});

describe('branchement dans le jeu', () => {
  it('la boucle de rendu passe par la cadence plafonnée et mesure l’intervalle entre images dessinées', () => {
    expect(gameSource).toContain('setAnimationLoop((ms) => this.tick(ms))');
    expect(gameSource).toContain('this.limiter.shouldRender(ms)');
    expect(gameSource).toContain('this.scaler.record(gap)');
    expect(gameSource).toContain('this.world.setPixelRatio(ratio)');
  });

  it('seul le héros projette une ombre portée : les ennemis gardent leur disque d’ombre', () => {
    expect(enemiesSource).toContain('mesh.castShadow = false');
    expect(enemiesSource).not.toContain('mesh.castShadow = true');
  });

  it('le monde utilise la qualité choisie (pixels, ombres, anticrénelage) et laisse le navigateur choisir la puce graphique', () => {
    expect(worldSource).toContain('quality.maxPixelRatio');
    expect(worldSource).toContain('quality.shadowMapSize');
    expect(worldSource).toContain('antialias: quality.antialias');
    expect(worldSource).toContain("powerPreference: 'default'");
    expect(worldSource).not.toContain("powerPreference: 'high-performance'");
  });

  it('le sol utilise le filtrage anisotrope choisi pour l’appareil', () => {
    expect(worldSource).toContain('buildGround(quality.anisotropy)');
    expect(worldSource).toContain('tex.anisotropy = anisotropy');
    expect(worldSource).not.toContain('tex.anisotropy = 8');
  });

  it('la 3D est redessinée à cadence réduite derrière les écrans qui la cachent (boutique, sauvegarde, crédits, coffres), pas derrière la collection', () => {
    expect(gameSource).toContain("(this.state === 'menu' && this.ui.sceneCovered)");
    const getter = uiSource.slice(uiSource.indexOf('get sceneCovered()'), uiSource.indexOf('showMenu(): void'));
    expect(getter).toContain('[this.shop, this.saveScreen, this.credits, this.changelog, this.reveal]');
    expect(getter).not.toContain('this.collection');
  });

  it('le HUD n’écrit dans le DOM que quand une valeur change', () => {
    for (const call of ['this.setWidth(this.hpFill, hpRatio)', 'this.setWidth(this.hpGhost, hpRatio)', 'this.setWidth(this.xpFill,', "this.setClass(this.hpBar, 'low'", "this.setClass(this.lowHp, 'active'"]) {
      expect(uiSource).toContain(call);
    }
    // Plus d'écriture directe à chaque image dans la mise à jour du HUD.
    const hud = uiSource.slice(uiSource.indexOf('updateHud('), uiSource.indexOf('  setLegend('));
    expect(hud).not.toContain('.style.width =');
    expect(hud).not.toContain('classList.toggle');
  });

  it('le menu principal passe à une cadence réduite, sauf pendant l’aperçu du héros, et la résolution ne se mesure qu’à la cadence de jeu', () => {
    expect(gameSource).toContain("const calm = !frozen && this.state === 'menu' && !this.previewing");
    expect(gameSource).toContain('frozen ? this.quality.frozenFps : calm ? this.quality.menuFps : this.quality.maxFps');
    expect(gameSource).toContain("const measurable = fps === this.quality.maxFps && this.state !== 'loading'");
    expect(gameSource).toContain('if (measurable && this.wasMeasurable && gap < 1000)');
  });

  it('sur mobile, le flou sur la 3D est retiré au profit d’un fond plus opaque', () => {
    expect(gameSource).toContain("document.documentElement.dataset.device = mobile ? 'mobile' : 'desktop'");
  });
});
