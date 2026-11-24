import * as THREE from 'three';
import { loadAssets } from './assets';
import { Sfx } from './audio';
import type { DevTools } from './dev';
import { AMULETS, amuletOf } from './amulets';
import { CHEST_PRICES, openChests, type ChestPrices } from './chests';
import { cosmeticColor } from './cosmetics';
import { Effects } from './effects';
import { MusicPlayer } from './music';
import { createFallbackHero, createModelHero, type HeroState, type HeroView } from './hero';
import { Input } from './input';
import {
  CHARACTERS,
  browserStorage,
  addLegend,
  buyShopItem,
  chooseCharacter,
  consumeAmulet,
  equipAmulet,
  selectCosmetic,
  chooseDifficulty,
  chooseWeapon,
  loadSave,
  persistSave,
  runReward,
  selectedDifficulty,
  startingStats,
} from './meta';
import { FrameLimiter, ResolutionScaler, isMobileDevice, qualityFor, type Quality } from './quality';
import { LEGEND_LEVEL, Run } from './run';
import { setupScreen } from './screenui';
import { setupUpdates, type UpdateBanner } from './updateui';
import { PASSIVES, WEAPON_PREFIX } from './upgrades';
import { WEAPONS } from './weaponData';
import { Ui } from './ui';
import type { Upgrade } from './upgrades';
import { World } from './world';

type State = 'loading' | 'menu' | 'playing' | 'paused' | 'levelup' | 'dying' | 'gameover';

const LEVEL_UP_COLOR = new THREE.Color(0xffe14d);
const SPECIAL_COLOR = new THREE.Color(0xffb13d);
const AURA_COLOR = new THREE.Color(0xff8a3d);
/** Confettis du mode Légende. */
const LEGEND_COLORS = [0xffd84d, 0xffffff, 0x6fe9ff, 0xff7ad9, 0x8dff6f].map((c) => new THREE.Color(c));
const DUST_COLOR = new THREE.Color(0xd9cfa0);
const MINE_COLOR = new THREE.Color(0xff7a3d);
const WHITE = new THREE.Color(0xffffff);
/** Couleur de l'éclat de départ des projectiles de chaque arme. */
const MUZZLE_COLORS: Record<string, THREE.Color> = {
  rifle: new THREE.Color(0xffd84d),
  spear: new THREE.Color(0x9fe6ff),
};
/** Durée de l'animation de mort du héros avant l'écran de fin. */
const DYING_TIME = 1.3;

/** Chef d'orchestre : relie la simulation (Run) au rendu, à l'interface, aux sons et à la sauvegarde. */
export class Game {
  private storage = browserStorage();
  private save = loadSave(this.storage);
  private world: World;
  private input: Input;
  private sfx = new Sfx();
  /** Musique de fond (menu, partie, boss) : démarre au premier geste de l'utilisateur. */
  private music = new MusicPlayer(() => this.sfx.audio);
  private effects: Effects;
  private ui: Ui;
  /** Créée une fois les modèles chargés. */
  private run: Run | null = null;
  private views = new Map<string, HeroView>();
  private view: HeroView | null = null;

  private state: State = 'loading';
  private last = 0;
  private dyingTimer = 0;
  /** Temps restant du clignotement du héros après un coup. */
  private hurtTimer = 0;
  private dustTimer = 0;
  private bossPoint = new THREE.Vector3();
  private legendTimer = 0;
  private stepTimer = 0;
  /** Aperçu du héros en entier (collection) : il pivote doucement pour se montrer sous tous les angles. */
  private previewing = false;
  /** Héros regardé dans l'aperçu sans être acheté : il remplace un moment le héros choisi à l'écran. */
  private tryHero: string | null = null;
  /** Le plein écran d'ouverture des coffres est affiché : la musique des coffres remplace celle du menu. */
  private chestOpening = false;
  /** Source de hasard des coffres (remplaçable par les tests de bout en bout). */
  private chestRandom: () => number = Math.random;
  /** Outils du mode dev (version de développement uniquement). */
  private dev: DevTools | null = null;
  /** Bandeau « Nouvelle version disponible ». */
  private updates: UpdateBanner;
  /** Qualité d'affichage choisie pour cet appareil (voir src/quality.ts). */
  private quality: Quality;
  private limiter: FrameLimiter;
  private scaler: ResolutionScaler;
  /** Heure de la dernière image dessinée, et si elle servait à mesurer la machine (cadence de jeu) : sinon l'écart ne mesure rien. */
  private lastRendered = 0;
  private wasMeasurable = false;
  /** Mesure d'images par seconde, affichée seulement avec ?debug. */
  private perf = { frames: 0, since: 0, fps: 0, text: null as HTMLElement | null };

  constructor(canvas: HTMLCanvasElement) {
    const mobile = isMobileDevice(navigator.userAgent, window.matchMedia?.('(pointer: coarse)').matches ?? false);
    this.quality = qualityFor({ mobile, devicePixelRatio: window.devicePixelRatio });
    this.limiter = new FrameLimiter(this.quality.maxFps);
    this.scaler = new ResolutionScaler(this.quality.minPixelRatio, this.quality.maxPixelRatio, 1000 / this.quality.maxFps);
    // Les styles s'allègent sur mobile (pas de flou sur la 3D qui bouge derrière les écrans).
    document.documentElement.dataset.device = mobile ? 'mobile' : 'desktop';
    this.world = new World(canvas, this.quality);
    this.input = new Input(canvas, document.getElementById('joystick')!, document.getElementById('knob')!);
    this.effects = new Effects(this.world.scene, this.world.camera, document.getElementById('floaters')!);
    this.sfx.muted = this.save.muted;
    this.music.setMuted(this.musicSilenced());
    this.sfx.onUnlock = () => this.music.resume();
    this.music.setTrack('menu');
    this.world.setAtmosphere(this.save.difficulty);

    this.ui = new Ui(this.save, {
      onPlay: () => {
        this.sfx.unlock();
        this.sfx.play('click');
        this.startRun();
      },
      onMenu: () => {
        this.sfx.play('click');
        this.enterMenu();
      },
      onNavigate: () => {
        this.sfx.unlock();
        this.sfx.play('click');
      },
      onSelectCharacter: (id) => {
        this.sfx.unlock();
        const result = chooseCharacter(this.save, id);
        this.sfx.play(result === 'denied' ? 'deny' : result === 'bought' ? 'buy' : 'click');
        this.commit();
        this.applyCharacter();
      },
      onSelectWeapon: (id) => {
        this.sfx.unlock();
        const result = chooseWeapon(this.save, id);
        this.sfx.play(result === 'denied' ? 'deny' : result === 'bought' ? 'buy' : 'click');
        this.commit();
      },
      onSelectDifficulty: (id) => {
        this.sfx.unlock();
        this.sfx.play(chooseDifficulty(this.save, id) ? 'click' : 'deny');
        this.world.setAtmosphere(this.save.difficulty);
        this.commit();
      },
      onOpenChests: (count) => {
        const rewards = openChests(this.save, count, this.chestRandom, this.chestPrices());
        this.sfx.unlock();
        if (!rewards) this.sfx.play('deny');
        if (rewards) this.commit();
        return rewards;
      },
      chestPrices: () => this.chestPrices(),
      onChestMusic: (on) => {
        this.chestOpening = on;
      },
      onChestSound: (sound) => {
        // Plus le contenu est rare, plus le son est triomphal.
        const names = { rumble: 'rumble', thud: 'thud', boom: 'boom', common: 'coin', rare: 'levelup', legendary: 'legend', mythic: 'mythic', next: 'click', recap: 'ready' } as const;
        this.sfx.play(names[sound]);
      },
      onEquipAmulet: (id, level) => {
        this.sfx.play('click');
        equipAmulet(this.save, id, level);
        this.commit();
      },
      onSelectCosmetic: (category, id) => {
        this.sfx.play('click');
        selectCosmetic(this.save, category, id);
        this.commit();
      },
      onBuy: (id) => {
        this.sfx.play(buyShopItem(this.save, id) ? 'buy' : 'deny');
        this.commit();
      },
      onPause: () => this.togglePause(),
      onResume: () => this.togglePause(),
      onQuit: () => {
        if (this.state !== 'paused' || !this.run) return;
        this.sfx.play('click');
        this.ui.setPaused(false);
        // Quitter clôt la partie comme une défaite : l'or gagné est versé et le bilan affiché.
        this.finishRun(this.run);
      },
      onToggleSound: () => {
        this.save.muted = !this.save.muted;
        this.sfx.muted = this.save.muted;
        this.music.setMuted(this.musicSilenced());
        this.sfx.unlock();
        this.sfx.play('click');
        this.commit();
      },
      onTryHero: (id) => {
        this.tryHero = id;
        this.applyCharacter();
      },
      onPreview: (view) => {
        this.world.setPreview(view);
        this.previewing = view !== null;
      },
      onToggleMusic: () => {
        // Tout le son est coupé : le bouton de la musique est grisé, il n'y a rien à régler.
        if (this.save.muted) return;
        this.save.music = !this.save.music;
        this.music.setMuted(this.musicSilenced());
        this.sfx.unlock();
        this.sfx.play('click');
        this.commit();
      },
      onImportSave: (data) => {
        // Le réglage du son appartient à cet appareil : il n'est pas remplacé par celui de la sauvegarde importée.
        Object.assign(this.save, data, { muted: this.save.muted, music: this.save.music });
        this.sfx.play('buy');
        this.world.setAtmosphere(this.save.difficulty);
        this.commit();
        this.applyCharacter();
      },
    });

    this.updates = setupUpdates();
    this.input.onPause = () => this.togglePause();
    // Plein écran (et horizontal verrouillé) sur mobile ; sur iPhone en vertical, l'invitation à tourner met la partie en pause.
    setupScreen(() => {
      if (this.state === 'playing') this.togglePause();
    });
    // Changer d'onglet ou verrouiller le téléphone met la partie en pause.
    document.addEventListener('visibilitychange', () => {
      // Rien ne joue en arrière-plan : musique et bruitages s'arrêtent, puis reprennent au retour.
      this.sfx.suspend(document.hidden);
      if (document.hidden && this.state === 'playing') this.togglePause();
    });

    if (new URLSearchParams(window.location.search).has('debug')) {
      this.installDebug();
      const text = document.createElement('div');
      text.id = 'perf';
      document.getElementById('app')!.append(text);
      this.perf.text = text;
    }

    this.world.renderer.setAnimationLoop((ms) => this.tick(ms));
    // Mode dev : ce bloc est supprimé de la version publiée (import.meta.env.DEV vaut alors false).
    if (import.meta.env.DEV) {
      void import('./dev').then(({ DevTools }) => {
        this.dev = new DevTools(this.storage, document.body, this.state === 'menu', () => this.ui.refresh());
        // Des prix de coffre réglés lors d'une session précédente s'appliquent tout de suite.
        this.ui.refresh();
      });
    }

    void this.load();
  }

  private async load(): Promise<void> {
    const assets = await loadAssets();
    for (const character of CHARACTERS) {
      const asset = assets.heroes[character.id];
      this.views.set(character.id, asset ? createModelHero(asset) : createFallbackHero());
    }

    const { effects, sfx, world } = this;
    this.run = new Run(world.scene, assets.enemies, {
      onShoot: (weapon, x, z, angle) => {
        sfx.play('shoot');
        // Petit éclat devant le héros, dans la direction du tir.
        effects.burst(x + Math.cos(angle) * 0.8, 1, z + Math.sin(angle) * 0.8, this.cosmeticTint('projectile') ?? MUZZLE_COLORS[weapon] ?? WHITE, 4, 3.5, 0.1);
      },
      onPulse: (x, z, radius) => {
        effects.ring(x, z, radius, AURA_COLOR, 22, 0.22);
        effects.shockwave(x, z, radius, AURA_COLOR);
      },
      onEnemyHit: (e, damage) => {
        sfx.play('hit');
        const value = Math.max(1, Math.round(damage));
        // Les gros coups sont plus grands et plus colorés.
        effects.floater(e.x, e.z, String(value), value >= 50 ? 'dmg big' : value >= 20 ? 'dmg mid' : 'dmg');
        effects.burst(e.x, e.radius, e.z, e.type.color, 2, 3, 0.11);
      },
      onEnemyKilled: (e) => {
        sfx.play('kill');
        const big = e.radius > 0.8;
        effects.burst(e.x, e.radius, e.z, e.type.color, big ? 20 : 8, big ? 8 : 5.5, big ? 0.24 : 0.17);
        effects.puff(e.x, e.radius * 0.7, e.z, e.type.color, big ? 1.3 : 0.7, big ? 5 : 3);
        effects.puff(e.x, e.radius * 0.7, e.z, WHITE, big ? 0.6 : 0.35, 2);
        if (big) world.shake(0.35);
      },
      onPickup: (kind, value) => {
        sfx.play(kind === 'gold' ? 'coin' : 'gem');
        if (kind === 'gold') effects.floater(this.run!.player.x, this.run!.player.z, `+${value} 🪙`, 'gold');
      },
      onPlayerHurt: () => {
        sfx.play('hurt');
        this.hurtTimer = 0.45;
        world.shake(0.3);
        this.ui.hurtFlash();
      },
      onLevelUp: () => {
        sfx.play('levelup');
        const { player } = this.run!;
        effects.burst(player.x, 1, player.z, LEVEL_UP_COLOR, 26, 7, 0.2);
        effects.shockwave(player.x, player.z, 3.5, LEVEL_UP_COLOR);
        effects.ring(player.x, player.z, 1.2, LEVEL_UP_COLOR, 18, 0.2);
      },
      onBossWave: (_wave, count) => {
        sfx.play('boss');
        world.shake(0.5);
        this.ui.showBanner(count > 1 ? `⚠ Boss ×${count} !` : '⚠ Boss !');
      },
      onBossSpawn: (e) => {
        effects.shockwave(e.x, e.z, 5, e.type.color);
        effects.burst(e.x, 1.5, e.z, e.type.color, 30, 9, 0.28);
      },
      onBossSlam: (e, radius) => {
        sfx.play('special');
        world.shake(0.6);
        effects.shockwave(e.x, e.z, radius, e.type.color);
        effects.ring(e.x, e.z, radius * 0.9, e.type.color, 32, 0.3);
        effects.puff(e.x, 0.4, e.z, e.type.color, 1.4, 6);
      },
      onMineBlast: (x, z, radius) => {
        sfx.play('hit');
        world.shake(0.12);
        effects.shockwave(x, z, radius, MINE_COLOR);
        effects.burst(x, 0.5, z, MINE_COLOR, 14, 7, 0.2);
      },
      onBossFire: (e) => {
        sfx.play('shoot');
        effects.burst(e.x, e.type.size * 0.6, e.z, e.type.color, 12, 6, 0.2);
      },
      onBossKilled: (e) => {
        sfx.play('special');
        world.shake(0.9);
        effects.shockwave(e.x, e.z, 9, e.type.color);
        effects.burst(e.x, 1.5, e.z, e.type.color, 70, 13, 0.32);
        effects.puff(e.x, 1, e.z, e.type.color, 2, 8);
        effects.ring(e.x, e.z, 2.5, LEVEL_UP_COLOR, 30, 0.3);
      },
      onLegend: () => {
        // Le badge (arme + difficulté jouées) est enregistré tout de suite : il est acquis même si la partie se termine peu après.
        addLegend(this.save, this.save.weapon, this.save.difficulty);
        this.commit();
        sfx.play('legend');
        world.shake(0.7);
        this.ui.showBanner('👑 LÉGENDE ! 60 s', 'legend');
        const { player } = this.run!;
        effects.shockwave(player.x, player.z, 14, LEGEND_COLORS[0]);
        effects.ring(player.x, player.z, 2, LEGEND_COLORS[0], 36, 0.3);
        for (const color of LEGEND_COLORS) effects.burst(player.x, 2.5, player.z, color, 30, 11, 0.24);
      },
      onLegendEnd: () => this.ui.showBanner('Fin du mode Légende', 'legend'),
      onSpecialReady: () => sfx.play('ready'),
      onSpecial: (x, z, radius) => {
        sfx.play('special');
        world.shake(0.7);
        effects.shockwave(x, z, radius, SPECIAL_COLOR);
        effects.burst(x, 0.5, z, SPECIAL_COLOR, 40, 11, 0.26);
        effects.ring(x, z, radius * 0.9, SPECIAL_COLOR, 40, 0.3);
        effects.puff(x, 0.4, z, SPECIAL_COLOR, 0.9, 6);
      },
    });

    // Attaque spéciale : appui bref sur le terrain, ou barre d'espace (vise l'ennemi le plus proche).
    this.input.onTap = (clientX, clientY) => {
      if (this.state !== 'playing') return;
      const point = world.groundPoint(clientX, clientY);
      if (point) this.run!.castSpecial(point.x, point.z);
    };
    this.input.onAction = () => {
      const run = this.run!;
      if (this.state !== 'playing') return;
      const { player } = run;
      const target = run.enemies.nearest(player.x, player.z, 16);
      // Sans ennemi proche : frappe devant le héros.
      const angle = player.group.rotation.y;
      run.castSpecial(target?.x ?? player.x + Math.sin(angle) * 4, target?.z ?? player.z + Math.cos(angle) * 4);
    };

    this.enterMenu();
    this.ui.setReady();
  }

  /** La musique se tait si tout le son est coupé, ou si elle a été coupée seule. */
  private musicSilenced(): boolean {
    return this.save.muted || !this.save.music;
  }

  /** Enregistre la sauvegarde et rafraîchit les écrans qui l'affichent. */
  private commit(): void {
    persistSave(this.storage, this.save);
    this.ui.refresh();
  }

  /** Attache au joueur le modèle du personnage sélectionné. */
  private applyCharacter(): void {
    const run = this.run;
    if (!run) return;
    const next = this.views.get(this.tryHero ?? this.save.selected) ?? null;
    if (next === this.view) return;
    if (this.view) run.player.group.remove(this.view.object);
    if (next) run.player.group.add(next.object);
    this.view = next;
  }

  /** Prix des coffres : ceux du jeu, ou 1 et 2 pièces si le mode dev le demande. */
  private chestPrices(): ChestPrices {
    return this.dev?.chestPrices() ?? CHEST_PRICES;
  }

  /** Remet la simulation à zéro avec les choix du menu : boutique, arme de départ et difficulté. */
  private resetRun(run: Run, useDev = false, amulet: { id: string; level: number } | null = null): void {
    run.reset(startingStats(this.save, amulet), {
      weapon: this.save.weapon,
      mods: selectedDifficulty(this.save).enemies,
      style: {
        projectile: cosmeticColor('projectile', this.save.style.projectile),
        trail: cosmeticColor('trail', this.save.style.trail),
      },
      // Mode dev : niveau et temps de départ choisis (uniquement au lancement d'une vraie partie).
      ...(useDev ? this.dev?.runSetup() : null),
    });
  }

  private enterMenu(): void {
    if (!this.run) return;
    this.resetRun(this.run);
    this.effects.clear();
    this.input.release();
    this.hurtTimer = 0;
    this.applyCharacter();
    this.world.setMode('menu');
    this.ui.showMenu();
    this.dev?.setVisible(true);
    this.state = 'menu';
  }

  private startRun(): void {
    if (!this.run) return;
    // L'amulette équipée est consommée : son effet ne vaut que pour cette partie.
    const amulet = consumeAmulet(this.save);
    if (amulet) this.commit();
    this.resetRun(this.run, true, amulet);
    this.hurtTimer = 0;
    this.dev?.setVisible(false);
    this.effects.clear();
    this.world.setMode('play');
    this.ui.showGame();
    this.state = 'playing';
    const worn = amulet ? amuletOf(amulet.id) : undefined;
    if (worn && amulet) this.ui.showBanner(`${worn.name} ×${amulet.level} : ${worn.describe(amulet.level)}`, 'legend');
  }

  /** Met la partie en pause, ou la reprend. Sans effet hors d'une partie en cours. */
  private togglePause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.input.release();
    } else if (this.state === 'paused') {
      this.state = 'playing';
    } else {
      return;
    }
    this.sfx.play('click');
    this.ui.setPaused(this.state === 'paused');
  }

  /**
   * Appelée à chaque top de l'écran : ne dessine que si la cadence plafonnée le permet, et ajuste la résolution
   * selon le temps réellement écoulé entre deux images dessinées.
   */
  private tick(ms: number): void {
    // Pause, choix de niveau, ou écran du menu qui cache la 3D (boutique, coffres...) : la scène ne bouge pas ou ne se voit
    // pas, quelques images par seconde suffisent.
    const frozen = this.state === 'paused' || this.state === 'levelup' || (this.state === 'menu' && this.ui.sceneCovered);
    // Menu principal : le héros ne fait que respirer, une cadence réduite suffit (sauf quand on le fait tourner dans la collection).
    const calm = !frozen && this.state === 'menu' && !this.previewing;
    const fps = frozen ? this.quality.frozenFps : calm ? this.quality.menuFps : this.quality.maxFps;
    if (fps !== this.limiter.fps) {
      this.limiter.setFps(fps);
      // La mesure de la résolution ne se fait qu'à la cadence de jeu : on repart d'une fenêtre neuve.
      this.scaler.setTarget(1000 / this.quality.maxFps);
    }
    if (!this.limiter.shouldRender(ms)) return;

    // Seules les images à la cadence de jeu disent ce que la machine sait faire : ni le chargement, ni la pause, ni le menu.
    const gap = ms - this.lastRendered;
    this.lastRendered = ms;
    const measurable = fps === this.quality.maxFps && this.state !== 'loading';
    if (measurable && this.wasMeasurable && gap < 1000) {
      const ratio = this.scaler.record(gap);
      if (ratio !== null) this.world.setPixelRatio(ratio);
    }
    this.wasMeasurable = measurable;

    this.frame(ms);
    this.measure(ms);
  }

  /** Compte les images dessinées et, avec ?debug, affiche images/s, résolution, appels de dessin et triangles. */
  private measure(ms: number): void {
    const perf = this.perf;
    // La première mesure part de maintenant : sinon elle compterait tout le temps de chargement de la page.
    if (perf.since === 0) perf.since = ms;
    perf.frames++;
    if (ms - perf.since < 1000) return;
    perf.fps = Math.round((perf.frames * 1000) / (ms - perf.since));
    perf.frames = 0;
    perf.since = ms;
    if (perf.text) {
      const { calls, triangles } = this.world.renderer.info.render;
      perf.text.textContent = `${perf.fps} i/s · résolution ×${this.scaler.ratio} · ${calls} appels · ${Math.round(triangles / 1000)} k triangles`;
    }
  }

  private frame(ms: number): void {
    // dt plafonné : évite un saut géant après un onglet mis en arrière-plan.
    const dt = Math.min((ms - this.last) / 1000, 0.05);
    this.last = ms;
    // Actualiser recharge la page : on ne le propose qu'au menu et en fin de partie, pour ne jamais perdre une partie en cours
    // (même en pause : quitter verse l'or gagné, recharger le perdrait).
    this.updates.show(this.updates.available && (this.state === 'menu' || this.state === 'gameover'));
    const run = this.run;
    if (!run) {
      this.world.render();
      return;
    }

    if (this.state === 'playing') {
      run.update(dt, this.input.vector);
      if (run.over) {
        this.state = 'dying';
        this.dyingTimer = DYING_TIME;
        this.input.release();
        this.sfx.play('gameover');
      } else if (run.pendingChoices) {
        this.openLevelUp(run, run.pendingChoices);
      }
    } else if (this.state === 'dying') {
      this.dyingTimer -= dt;
      if (this.dyingTimer <= 0) this.finishRun(run);
    }

    const { player } = run;
    if (this.state === 'menu') player.group.rotation.y = this.previewing ? Math.sin(ms / 1000 * 1.2) * 0.8 : 0;
    let heroState: HeroState = 'idle';
    if (this.state === 'dying' || this.state === 'gameover') heroState = 'dead';
    else if (this.state === 'playing' && player.moving) heroState = 'run';
    this.view?.update(dt, heroState, player.stats.speed);

    this.updateHeroEffects(dt, run, heroState);
    this.updateBossBars(run);
    this.updateLegend(dt, run);
    this.updateMusic(run);
    this.effects.update(dt);
    this.world.follow(player.x, player.z, dt);
    if (this.state !== 'menu') {
      this.ui.updateHud(player.hp, player.stats.maxHp, run.xp / run.xpNeeded, run.level, run.time, run.kills, run.gold, run.charge);
    }
    this.world.render();
  }

  /** Choisit la musique : menu, partie, ou boss tant qu'il y en a un ; atténuée en pause et pendant les choix. */
  private updateMusic(run: Run): void {
    const inGame = this.state === 'playing' || this.state === 'paused' || this.state === 'levelup' || this.state === 'dying';
    this.music.setTrack(inGame ? (run.enemies.bossCount > 0 ? 'boss' : 'game') : this.chestOpening ? 'chest' : 'menu');
    this.music.setDuck(this.state === 'paused' || this.state === 'levelup' || this.state === 'dying');
  }

  /** Mode Légende : compte à rebours, pluie de confettis et pulsations dorées autour du héros. */
  private updateLegend(dt: number, run: Run): void {
    const active = this.state === 'playing' && run.legendTime > 0;
    this.ui.setLegend(this.state === 'playing' || this.state === 'paused' || this.state === 'levelup' ? run.legendTime : 0);
    if (!active) return;
    const { player } = run;
    this.legendTimer -= dt;
    if (this.legendTimer > 0) return;
    this.legendTimer = 0.3;
    const color = LEGEND_COLORS[Math.floor(Math.random() * LEGEND_COLORS.length)];
    this.effects.burst(player.x + (Math.random() - 0.5) * 12, 3.5, player.z + (Math.random() - 0.5) * 8, color, 5, 2, 0.2);
    this.effects.ring(player.x, player.z, 1.3, LEGEND_COLORS[0], 8, 0.16);
  }

  /** Barre de vie au-dessus de chaque boss (ramenée au bord de l'écran s'il est hors champ). */
  private updateBossBars(run: Run): void {
    const inGame = this.state === 'playing' || this.state === 'paused' || this.state === 'levelup';
    if (!inGame) {
      this.ui.setBossBars([]);
      return;
    }
    const bars: { x: number; y: number; ratio: number; off: boolean }[] = [];
    for (const e of run.enemies.list) {
      if (!e.boss) continue;
      this.bossPoint.set(e.x, e.type.size + 0.9, e.z).project(this.world.camera);
      const behind = this.bossPoint.z > 1;
      const px = behind ? -this.bossPoint.x : this.bossPoint.x;
      const py = behind ? -this.bossPoint.y : this.bossPoint.y;
      const x = ((px + 1) / 2) * 100;
      const y = ((1 - py) / 2) * 100;
      const off = behind || x < 5 || x > 95 || y < 12 || y > 92;
      bars.push({ x: Math.min(94, Math.max(6, x)), y: Math.min(90, Math.max(14, y)), ratio: e.hp / e.maxHp, off });
    }
    this.ui.setBossBars(bars);
  }

  /** Couleur de l'apparence choisie dans une catégorie (nouvel objet à chaque appel), ou null pour la couleur d'origine. */
  private cosmeticTint(category: 'projectile' | 'dust'): THREE.Color | null {
    const spec = cosmeticColor(category, this.save.style[category]);
    if (spec === null) return null;
    return spec === 'rainbow' ? new THREE.Color().setHSL((performance.now() / 1000 * 0.6) % 1, 1, 0.6) : new THREE.Color(spec);
  }

  /** Poussière sous les pas du héros et clignotement quand il est touché. */
  private updateHeroEffects(dt: number, run: Run, heroState: HeroState): void {
    const { player } = run;
    const dead = heroState === 'dead';

    if (this.state === 'playing') {
      if (player.moving) {
        // Pas discrets : plus rapprochés quand le héros va plus vite.
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) {
          this.stepTimer = Math.min(0.5, Math.max(0.2, (0.34 * 6) / player.stats.speed));
          this.sfx.play('step');
        }
        this.dustTimer -= dt;
        if (this.dustTimer <= 0) {
          this.dustTimer = 0.11;
          this.effects.puff(player.x, 0.1, player.z, this.cosmeticTint('dust') ?? DUST_COLOR, 0.3, 1);
        }
      }
      this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    }
    // Le clignotement n'existe qu'en partie : le chrono ne baisse que là, donc hors partie (menu, aperçu des héros) il resterait
    // figé sur une valeur « cachée » et le héros disparaîtrait.
    const blinking = this.state === 'playing' && !dead;
    if (this.view) this.view.object.visible = !blinking || this.hurtTimer <= 0 || Math.floor(this.hurtTimer * 18) % 2 === 0;
  }

  private openLevelUp(run: Run, choices: Upgrade[]): void {
    this.state = 'levelup';
    this.input.release();
    this.ui.showLevelUp(
      choices.map((upgrade) => ({ upgrade, level: run.upgradeLevels.get(upgrade.id) ?? 0 })),
      (upgrade) => {
        this.sfx.play('click');
        run.choose(upgrade);
        // S'il reste assez d'XP pour un autre niveau, la prochaine frame rouvrira l'écran.
        this.state = 'playing';
      },
    );
  }

  private finishRun(run: Run): void {
    const multiplier = selectedDifficulty(this.save).gold;
    // Le temps de départ du mode dev ne compte ni pour la récompense ni pour le record.
    const survived = run.survived;
    const reward = runReward(run.gold, survived, multiplier);
    const isRecord = !run.customStart && survived > this.save.bestTime;
    this.save.gold += reward;
    if (isRecord) this.save.bestTime = Math.floor(survived);
    this.commit();
    this.ui.showGameOver({ time: survived, kills: run.kills, level: run.level, reward, multiplier, isRecord });
    this.state = 'gameover';
  }

  /** Outils pour les tests de bout en bout, exposés seulement avec `?debug` dans l'adresse. */
  private installDebug(): void {
    (window as unknown as { __game: unknown }).__game = {
      state: () => ({
        state: this.state,
        time: this.run?.time ?? 0,
        hp: this.run?.player.hp ?? 0,
        invincible: this.run?.player.invincible ?? false,
        pending: this.run?.pendingChoices?.length ?? 0,
        x: this.run?.player.x ?? 0,
        z: this.run?.player.z ?? 0,
        kills: this.run?.kills ?? 0,
        level: this.run?.level ?? 0,
        enemies: this.run?.enemies.list.length ?? 0,
        charge: this.run?.charge ?? 0,
        gold: this.save.gold,
        selected: this.save.selected,
        legendTime: this.run?.legendTime ?? 0,
        legendBadges: JSON.parse(JSON.stringify(this.save.legend)) as Record<string, string[]>,
        bosses: this.run?.enemies.bossCount ?? 0,
        bossWave: this.run?.bossWave ?? 0,
        pickups: this.run?.pickups.count ?? 0,
        amulets: { ...this.save.amulets },
        amulet: this.save.amulet,
        xpMult: this.run?.player.stats.xpMult ?? 1,
        style: { ...this.save.style },
        cosmetics: JSON.parse(JSON.stringify(this.save.cosmetics)) as Record<string, string[]>,
        savedWeapons: [...this.save.weapons],
        quality: { ...this.quality, fps: this.perf.fps, pixelRatio: this.scaler.ratio, mobile: document.documentElement.dataset.device === 'mobile' },
        audio: { state: this.sfx.audio?.ctx.state ?? 'aucun', track: this.music.current, wanted: this.music.wanted, silenced: this.musicSilenced() },
        weapon: this.save.weapon,
        weapons: this.run?.weapons.owned ?? [],
        difficulty: this.save.difficulty,
        hasModel: this.view !== null,
        heroShown: this.view?.object.visible ?? false,
        previewing: this.previewing,
        trying: this.tryHero,
      }),
      /** Rectangle écran (px) du héros debout : de sa tête à ses pieds, pour vérifier qu'il se voit en entier. */
      heroBox: () => {
        const player = this.run?.player;
        if (!player) return null;
        const head = new THREE.Vector3(player.x, 1.9, player.z).project(this.world.camera);
        const feet = new THREE.Vector3(player.x, 0, player.z).project(this.world.camera);
        const toY = (v: THREE.Vector3) => ((1 - v.y) / 2) * window.innerHeight;
        return { top: toY(head), bottom: toY(feet), x: ((head.x + 1) / 2) * window.innerWidth, cameraY: this.world.camera.position.y };
      },
      /** Tue le héros. La régénération est coupée : sinon un héros qui en a une serait soigné avant le contrôle de mort et survivrait. */
      kill: () => {
        const player = this.run?.player;
        if (!player) return;
        player.stats.regen = 0;
        player.takeDamage(1e9);
      },
      /** Affiche l'annonce centrale (comme à l'arrivée d'un boss), pour mesurer sa taille. */
      banner: (text: string) => this.ui.showBanner(text),
      /** Lance le clignotement du héros touché avec `t` secondes restantes (0,45 au plus) : pour reproduire une mort en plein clignotement. */
      blink: (t: number) => {
        this.hurtTimer = t;
      },
      /** Avance le chronomètre de la partie (pour déclencher une vague de boss). */
      setTime: (t: number) => {
        if (this.run) this.run.time = t;
      },
      /** Amène les boss à `distance` à droite du héros, en pleine visée (pour les captures du test). */
      bringBosses: (distance: number) => {
        const run = this.run;
        if (!run) return;
        for (const e of run.enemies.list) {
          if (!e.boss) continue;
          e.x = run.player.x + distance;
          e.z = run.player.z;
          e.boss = { phase: 'aim', attack: 'charge', timer: 1.1, dirX: -1, dirZ: 0 };
        }
      },
      /** Amène le héros au bord du niveau 100 : le prochain gain d'XP déclenche le mode Légende. */
      legend: () => {
        const run = this.run;
        if (!run) return;
        run.level = LEGEND_LEVEL - 1;
        run.xp = run.xpNeeded;
      },
      /** Fixe les « dés » des coffres : les valeurs sont lues en boucle à la place du hasard. */
      chestRandom: (values: number[]) => {
        let i = 0;
        this.chestRandom = () => values[i++ % values.length];
      },
      /** Tue tous les boss vivants. */
      killBosses: () => {
        for (const e of this.run?.enemies.list ?? []) if (e.boss) e.hp = 0;
      },
      /** Met toutes les améliorations au maximum. */
      maxUpgrades: () => {
        const run = this.run;
        if (!run) return;
        for (const u of PASSIVES) run.upgradeLevels.set(u.id, u.max);
        for (const w of WEAPONS) run.upgradeLevels.set(WEAPON_PREFIX + w.id, w.levels.length);
      },
      /** Donne juste assez d'XP pour passer un niveau. */
      levelUp: () => {
        if (this.run) this.run.xp = this.run.xpNeeded;
      },
      /** Fait apparaître `count` slimes en cercle à `distance` du héros. */
      spawn: (count: number, distance: number) => {
        const run = this.run;
        if (!run) return;
        for (let i = 0; i < count; i++) {
          const e = run.enemies.spawn(0, 0, 0);
          const a = (i / count) * Math.PI * 2;
          e.x = run.player.x + Math.cos(a) * distance;
          e.z = run.player.z + Math.sin(a) * distance;
        }
      },
      fillSpecial: () => {
        if (this.run) this.run.charge = 1;
      },
      /** Donne `n` exemplaires de chaque amulette. */
      giveAmulets: (n: number) => {
        for (const a of AMULETS) this.save.amulets[a.id] = n;
        this.commit();
      },
      /** Débloque toutes les armes et note le niveau 100 pour chacune (badges du menu). */
      unlockAll: () => {
        for (const w of WEAPONS) {
          if (!this.save.weapons.includes(w.id)) this.save.weapons.push(w.id);
          addLegend(this.save, w.id, this.save.difficulty);
        }
        this.commit();
      },
      /** Gonfle les chiffres du HUD (PV, niveau, ennemis tués, or) pour vérifier que rien ne déborde. */
      hudStress: () => {
        const run = this.run;
        if (!run) return;
        run.player.stats.maxHp = 9999;
        run.player.hp = 9999;
        run.level = 100;
        run.kills = 99999;
        run.gold = 99999;
      },
      addGold: (amount: number) => {
        this.save.gold += amount;
        this.commit();
      },
    };
  }
}
