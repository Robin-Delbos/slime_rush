import * as THREE from 'three';
import { loadAssets } from './assets';
import { Sfx } from './audio';
import { Effects } from './effects';
import { createFallbackHero, createModelHero, type HeroState, type HeroView } from './hero';
import { Input } from './input';
import {
  CHARACTERS,
  browserStorage,
  buyShopItem,
  chooseCharacter,
  chooseDifficulty,
  chooseWeapon,
  loadSave,
  persistSave,
  runReward,
  selectedDifficulty,
  startingStats,
} from './meta';
import { Run } from './run';
import { Ui } from './ui';
import type { Upgrade } from './upgrades';
import { World } from './world';

type State = 'loading' | 'menu' | 'playing' | 'paused' | 'levelup' | 'dying' | 'gameover';

const LEVEL_UP_COLOR = new THREE.Color(0xffe14d);
const SPECIAL_COLOR = new THREE.Color(0xffb13d);
const AURA_COLOR = new THREE.Color(0xff8a3d);
const DUST_COLOR = new THREE.Color(0xd9cfa0);
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

  constructor(canvas: HTMLCanvasElement) {
    this.world = new World(canvas);
    this.input = new Input(canvas, document.getElementById('joystick')!, document.getElementById('knob')!);
    this.effects = new Effects(this.world.scene, this.world.camera, document.getElementById('floaters')!);
    this.sfx.muted = this.save.muted;
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
        this.sfx.unlock();
        this.sfx.play('click');
        this.commit();
      },
      onImportSave: (data) => {
        // Le réglage du son appartient à cet appareil : il n'est pas remplacé par celui de la sauvegarde importée.
        Object.assign(this.save, data, { muted: this.save.muted });
        this.sfx.play('buy');
        this.world.setAtmosphere(this.save.difficulty);
        this.commit();
        this.applyCharacter();
      },
    });

    this.input.onPause = () => this.togglePause();
    // Changer d'onglet ou verrouiller le téléphone met la partie en pause.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.togglePause();
    });

    if (new URLSearchParams(window.location.search).has('debug')) this.installDebug();

    this.world.renderer.setAnimationLoop((ms) => this.frame(ms));
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
        effects.burst(x + Math.cos(angle) * 0.8, 1, z + Math.sin(angle) * 0.8, MUZZLE_COLORS[weapon] ?? WHITE, 4, 3.5, 0.1);
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

  /** Enregistre la sauvegarde et rafraîchit les écrans qui l'affichent. */
  private commit(): void {
    persistSave(this.storage, this.save);
    this.ui.refresh();
  }

  /** Attache au joueur le modèle du personnage sélectionné. */
  private applyCharacter(): void {
    const run = this.run;
    if (!run) return;
    const next = this.views.get(this.save.selected) ?? null;
    if (next === this.view) return;
    if (this.view) run.player.group.remove(this.view.object);
    if (next) run.player.group.add(next.object);
    this.view = next;
  }

  /** Remet la simulation à zéro avec les choix du menu : boutique, arme de départ et difficulté. */
  private resetRun(run: Run): void {
    run.reset(startingStats(this.save), {
      weapon: this.save.weapon,
      mods: selectedDifficulty(this.save).enemies,
    });
  }

  private enterMenu(): void {
    if (!this.run) return;
    this.resetRun(this.run);
    this.effects.clear();
    this.input.release();
    this.applyCharacter();
    this.world.setMode('menu');
    this.ui.showMenu();
    this.state = 'menu';
  }

  private startRun(): void {
    if (!this.run) return;
    this.resetRun(this.run);
    this.effects.clear();
    this.world.setMode('play');
    this.ui.showGame();
    this.state = 'playing';
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

  private frame(ms: number): void {
    // dt plafonné : évite un saut géant après un onglet mis en arrière-plan.
    const dt = Math.min((ms - this.last) / 1000, 0.05);
    this.last = ms;
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
    let heroState: HeroState = 'idle';
    if (this.state === 'dying' || this.state === 'gameover') heroState = 'dead';
    else if (this.state === 'playing' && player.moving) heroState = 'run';
    this.view?.update(dt, heroState, player.stats.speed);

    this.updateHeroEffects(dt, run, heroState);
    this.effects.update(dt);
    this.world.follow(player.x, player.z, dt);
    if (this.state !== 'menu') {
      this.ui.updateHud(player.hp, player.stats.maxHp, run.xp / run.xpNeeded, run.level, run.time, run.kills, run.gold, run.charge);
    }
    this.world.render();
  }

  /** Poussière sous les pas du héros et clignotement quand il est touché. */
  private updateHeroEffects(dt: number, run: Run, heroState: HeroState): void {
    const { player } = run;
    const dead = heroState === 'dead';

    if (this.state === 'playing') {
      if (player.moving) {
        this.dustTimer -= dt;
        if (this.dustTimer <= 0) {
          this.dustTimer = 0.11;
          this.effects.puff(player.x, 0.1, player.z, DUST_COLOR, 0.3, 1);
        }
      }
      this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    }
    if (this.view && !dead) this.view.object.visible = this.hurtTimer <= 0 || Math.floor(this.hurtTimer * 18) % 2 === 0;
    else if (this.view) this.view.object.visible = true;
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
    const reward = runReward(run.gold, run.time, multiplier);
    const isRecord = run.time > this.save.bestTime;
    this.save.gold += reward;
    if (isRecord) this.save.bestTime = Math.floor(run.time);
    this.commit();
    this.ui.showGameOver({ time: run.time, kills: run.kills, level: run.level, reward, multiplier, isRecord });
    this.state = 'gameover';
  }

  /** Outils pour les tests de bout en bout, exposés seulement avec `?debug` dans l'adresse. */
  private installDebug(): void {
    (window as unknown as { __game: unknown }).__game = {
      state: () => ({
        state: this.state,
        time: this.run?.time ?? 0,
        kills: this.run?.kills ?? 0,
        level: this.run?.level ?? 0,
        enemies: this.run?.enemies.list.length ?? 0,
        charge: this.run?.charge ?? 0,
        gold: this.save.gold,
        selected: this.save.selected,
        weapon: this.save.weapon,
        weapons: this.run?.weapons.owned ?? [],
        difficulty: this.save.difficulty,
        hasModel: this.view !== null,
      }),
      kill: () => this.run?.player.takeDamage(1e9),
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
      addGold: (amount: number) => {
        this.save.gold += amount;
        this.commit();
      },
    };
  }
}
