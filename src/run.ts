import type * as THREE from 'three';
import { BOSS_TYPES, Enemies, NO_MODS, type Enemy, type EnemyMods, type EnemyVisuals } from './enemies';
import { Pickups, type PickupKind } from './pickups';
import { Player, baseStats, type MoveInput, type Stats } from './player';
import { rand, random } from './rng';
import { rollUpgrades, WEAPON_PREFIX, type Upgrade } from './upgrades';
import { DEFAULT_WEAPON } from './weaponData';
import { Weapons } from './weapons';

/** Signaux émis par la simulation ; l'affichage s'en sert pour les sons et les effets. */
export interface RunEvents {
  onShoot?(weapon: string, x: number, z: number, angle: number): void;
  /** L'aura vient de pulser. */
  onPulse?(x: number, z: number, radius: number): void;
  onEnemyHit?(e: Enemy, damage: number): void;
  onEnemyKilled?(e: Enemy): void;
  onPickup?(kind: PickupKind, value: number): void;
  onPlayerHurt?(): void;
  onLevelUp?(level: number): void;
  onGameOver?(): void;
  /** La jauge d'attaque spéciale vient de se remplir. */
  onSpecialReady?(): void;
  onSpecial?(x: number, z: number, radius: number): void;
  /** Une vague de boss commence : numéro de la vague et nombre de boss prévus. */
  onBossWave?(wave: number, count: number): void;
  onBossSpawn?(e: Enemy): void;
  onBossKilled?(e: Enemy): void;
  /** Un boss frappe autour de lui. */
  onBossSlam?(e: Enemy, radius: number): void;
  /** Un boss tire une salve de projectiles. */
  onBossFire?(e: Enemy): void;
  /** Le niveau 100 vient d'être atteint : le mode Légende commence. */
  onLegend?(): void;
  /** Les 60 secondes du mode Légende sont écoulées. */
  onLegendEnd?(): void;
}

/** Réglages d'une partie, en plus des caractéristiques de départ du héros. */
export interface RunSetup {
  /** Arme choisie : la seule de la partie. */
  weapon?: string;
  /** Difficulté des ennemis. */
  mods?: EnemyMods;
}

/** Un boss arrive toutes les 2 minutes, et il y en a un de plus à chaque vague (jusqu'à MAX_BOSSES en même temps). */
export const BOSS_INTERVAL = 120;
export const MAX_BOSSES = 4;
/** Délai entre deux boss d'une même vague. */
export const BOSS_SPACING = 6;
/** Ce qu'un boss lâche en mourant. */
export const BOSS_COINS = 14;
export const BOSS_COIN_VALUE = 3;
export const BOSS_GEMS = 12;
export const BOSS_GEM_VALUE = 3;
/**
 * Niveau secret : l'atteindre déclenche pendant 60 secondes un mode ultra-puissant (invincible, très fort),
 * puis la partie reprend normalement. Aucun bonus de pièces.
 */
export const LEGEND_LEVEL = 100;
export const LEGEND_TIME = 60;
export const LEGEND_BOOST = { damage: 10, cooldown: 1 / 3, speed: 1.3, magnet: 6 };

/** Part des PV max rendue à chaque passage de niveau (dès le premier). */
export const LEVEL_HEAL = 0.1;

/** Rayon de l'explosion de l'attaque spéciale. */
export const SPECIAL_RADIUS = 5;
/** Dégâts de l'attaque spéciale, en multiple des dégâts d'un tir. */
export const SPECIAL_DAMAGE = 8;
/** Points d'XP d'ennemis à tuer pour remplir la jauge (un slime vaut 1, un orc 6). */
export const SPECIAL_COST = 30;

/** XP nécessaire pour passer du niveau `level` au suivant. */
export function xpForLevel(level: number): number {
  return Math.round(4 + level * 3.5);
}

/**
 * Simulation d'une partie, sans rendu ni interface : c'est ce que les tests font tourner.
 * La partie se fige tant qu'un choix d'amélioration est en attente (`pendingChoices`).
 */
export class Run {
  readonly player: Player;
  readonly enemies: Enemies;
  readonly weapons: Weapons;
  readonly pickups: Pickups;
  readonly upgradeLevels = new Map<string, number>();

  time = 0;
  kills = 0;
  level = 1;
  xp = 0;
  gold = 0;
  over = false;
  pendingChoices: Upgrade[] | null = null;
  /** Jauge d'attaque spéciale, de 0 à 1. */
  charge = 0;
  /** Numéro de la dernière vague de boss lancée (0 = aucune). */
  bossWave = 0;
  /** Temps restant du mode Légende (0 = inactif). */
  legendTime = 0;
  /** Vrai dès que le niveau 100 a été atteint dans cette partie. */
  legendReached = false;

  private nextBossAt = BOSS_INTERVAL;
  /** Boss de la vague en cours qui n'ont pas encore été lancés. */
  private bossQueue = 0;
  private bossTimer = 0;
  private bossSerial = 0;
  private hurtCooldown = 0;
  /** Les ennemis tués par l'attaque spéciale ne rechargent pas la jauge. */
  private chargeLocked = false;

  constructor(
    scene: THREE.Scene,
    visuals: EnemyVisuals,
    public events: RunEvents = {},
  ) {
    this.player = new Player(scene);
    this.enemies = new Enemies(scene, visuals);
    this.weapons = new Weapons(scene);
    this.pickups = new Pickups(scene);

    this.weapons.onShoot = (weapon, x, z, angle) => this.events.onShoot?.(weapon, x, z, angle);
    this.weapons.onPulse = (x, z, radius) => this.events.onPulse?.(x, z, radius);
    this.enemies.onHit = (e, damage) => this.events.onEnemyHit?.(e, damage);
    this.enemies.onSlam = (e, radius) => this.events.onBossSlam?.(e, radius);
    this.enemies.onFire = (e) => this.events.onBossFire?.(e);
    this.pickups.onPickup = (kind, value) => this.events.onPickup?.(kind, value);
  }

  get xpNeeded(): number {
    return xpForLevel(this.level);
  }

  /** Remet tout à zéro pour une nouvelle partie avec les caractéristiques de départ et les réglages donnés. */
  reset(stats: Stats = baseStats(), setup: RunSetup = {}): void {
    this.player.reset(stats);
    this.enemies.clear();
    this.weapons.clear();
    this.pickups.clear();
    this.upgradeLevels.clear();
    this.enemies.mods = setup.mods ?? NO_MODS;
    const weapon = setup.weapon ?? DEFAULT_WEAPON;
    if (this.weapons.levelUp(weapon) > 0) this.upgradeLevels.set(WEAPON_PREFIX + weapon, 1);
    this.time = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.gold = 0;
    this.over = false;
    this.pendingChoices = null;
    this.hurtCooldown = 0;
    this.charge = 0;
    this.chargeLocked = false;
    this.bossWave = 0;
    this.legendTime = 0;
    this.legendReached = false;
    this.nextBossAt = BOSS_INTERVAL;
    this.bossQueue = 0;
    this.bossTimer = 0;
    this.bossSerial = 0;
  }

  get specialReady(): boolean {
    return this.charge >= 1;
  }

  /**
   * Déclenche l'attaque spéciale au point visé : explosion qui blesse et repousse
   * tous les ennemis dans le rayon. Renvoie false si la jauge n'est pas pleine.
   */
  castSpecial(x: number, z: number): boolean {
    if (this.over || this.pendingChoices || !this.specialReady) return false;
    this.charge = 0;
    this.chargeLocked = true;
    const damage = this.player.stats.damage * SPECIAL_DAMAGE;
    // Copie de la liste : les callbacks de hit ne doivent pas perturber le parcours.
    for (const e of [...this.enemies.list]) {
      const dx = e.x - x;
      const dz = e.z - z;
      const d = Math.hypot(dx, dz);
      if (d > SPECIAL_RADIUS + e.radius) continue;
      // Recul vers l'extérieur de l'explosion, plus fort que celui d'un tir.
      const push = d > 0.001 ? 4 / d : 0;
      this.enemies.hit(e, damage, dx * push, dz * push);
    }
    this.events.onSpecial?.(x, z, SPECIAL_RADIUS);
    return true;
  }

  update(dt: number, move: MoveInput): void {
    if (this.over || this.pendingChoices) return;
    const { player } = this;
    this.time += dt;

    if (this.legendTime > 0) {
      this.legendTime -= dt;
      if (this.legendTime <= 0) this.endLegend();
    }

    player.update(dt, move);
    this.updateBosses(dt);
    this.enemies.update(dt, this.time, player);
    this.weapons.update(dt, this.time, player, this.enemies);
    this.enemies.sweepDead((e) => {
      this.kills++;
      if (e.boss) this.dropBossLoot(e);
      else {
        this.pickups.spawn('xp', e.x, e.z, e.type.xp);
        if (random() < e.type.coinChance) this.pickups.spawn('gold', e.x, e.z, e.type.coinValue);
      }
      this.events.onEnemyKilled?.(e);
      if (!this.chargeLocked && !this.specialReady) {
        this.charge = Math.min(1, this.charge + e.type.xp / SPECIAL_COST);
        if (this.specialReady) this.events.onSpecialReady?.();
      }
    });
    this.chargeLocked = false;

    const gained = this.pickups.update(dt, this.time, player);
    this.xp += gained.xp * player.stats.xpMult;
    this.gold += gained.gold * player.stats.goldMult;

    this.hurtCooldown -= dt;
    if (player.hurt && this.hurtCooldown <= 0) {
      this.events.onPlayerHurt?.();
      this.hurtCooldown = 0.4;
    }
    player.hurt = false;

    if (player.hp <= 0) {
      this.over = true;
      this.events.onGameOver?.();
      return;
    }

    if (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      this.events.onLevelUp?.(this.level);
      // Chaque niveau rend un peu de vie, même quand il n'y a plus rien à améliorer.
      player.heal(player.stats.maxHp * LEVEL_HEAL);
      const picks = rollUpgrades(this.upgradeLevels, 3);
      if (this.level === LEGEND_LEVEL && !this.legendReached) {
        // Niveau 100 : pas de cartes, le mode Légende commence.
        this.startLegend();
      } else if (picks.length > 0) {
        // S'il ne reste plus rien à améliorer, le niveau ne propose pas de carte (le soin suffit).
        this.pendingChoices = picks;
      }
    }
  }

  private startLegend(): void {
    const { player } = this;
    this.legendReached = true;
    this.legendTime = LEGEND_TIME;
    player.invincible = true;
    player.stats.damage *= LEGEND_BOOST.damage;
    player.stats.cooldown *= LEGEND_BOOST.cooldown;
    player.stats.speed *= LEGEND_BOOST.speed;
    player.stats.magnet *= LEGEND_BOOST.magnet;
    this.events.onLegend?.();
  }

  private endLegend(): void {
    const { player } = this;
    this.legendTime = 0;
    player.invincible = false;
    player.stats.damage /= LEGEND_BOOST.damage;
    player.stats.cooldown /= LEGEND_BOOST.cooldown;
    player.stats.speed /= LEGEND_BOOST.speed;
    player.stats.magnet /= LEGEND_BOOST.magnet;
    this.events.onLegendEnd?.();
  }

  /** Lance les vagues de boss : une toutes les 2 minutes, avec un boss de plus à chaque fois. */
  private updateBosses(dt: number): void {
    if (this.time >= this.nextBossAt) {
      this.bossWave++;
      this.nextBossAt += BOSS_INTERVAL;
      const count = Math.min(this.bossWave, MAX_BOSSES);
      this.bossQueue += count;
      this.bossTimer = 0;
      this.events.onBossWave?.(this.bossWave, count);
    }
    if (this.bossQueue <= 0) return;
    this.bossTimer -= dt;
    // Les boss arrivent un par un, et jamais plus de MAX_BOSSES à la fois.
    if (this.bossTimer <= 0 && this.enemies.bossCount < MAX_BOSSES) {
      const type = BOSS_TYPES[this.bossSerial++ % BOSS_TYPES.length];
      const boss = this.enemies.spawn(this.time, this.player.x, this.player.z, type);
      this.bossQueue--;
      this.bossTimer = BOSS_SPACING;
      this.events.onBossSpawn?.(boss);
    }
  }

  /** Gerbe de pièces et de gemmes d'XP autour du boss mort. */
  private dropBossLoot(e: Enemy): void {
    const scatter = (kind: 'gold' | 'xp', count: number, value: number) => {
      for (let i = 0; i < count; i++) {
        const angle = rand(0, Math.PI * 2);
        const distance = rand(0.6, 3.2);
        this.pickups.spawn(kind, e.x + Math.cos(angle) * distance, e.z + Math.sin(angle) * distance, value);
      }
    };
    scatter('gold', BOSS_COINS, BOSS_COIN_VALUE);
    scatter('xp', BOSS_GEMS, BOSS_GEM_VALUE);
    this.events.onBossKilled?.(e);
  }

  /** Applique l'amélioration choisie et relance la partie. */
  choose(upgrade: Upgrade): void {
    if (!this.pendingChoices?.includes(upgrade)) return;
    upgrade.apply(this);
    this.upgradeLevels.set(upgrade.id, (this.upgradeLevels.get(upgrade.id) ?? 0) + 1);
    this.pendingChoices = null;
  }
}
