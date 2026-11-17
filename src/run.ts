import type * as THREE from 'three';
import { Enemies, NO_MODS, type Enemy, type EnemyMods, type EnemyVisuals } from './enemies';
import { Pickups, type PickupKind } from './pickups';
import { Player, baseStats, type MoveInput, type Stats } from './player';
import { random } from './rng';
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
}

/** Réglages d'une partie, en plus des caractéristiques de départ du héros. */
export interface RunSetup {
  /** Arme choisie : la seule de la partie. */
  weapon?: string;
  /** Difficulté des ennemis. */
  mods?: EnemyMods;
}

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

    player.update(dt, move);
    this.enemies.update(dt, this.time, player);
    this.weapons.update(dt, this.time, player, this.enemies);
    this.enemies.sweepDead((e) => {
      this.kills++;
      this.pickups.spawn('xp', e.x, e.z, e.type.xp);
      if (random() < e.type.coinChance) this.pickups.spawn('gold', e.x, e.z, e.type.coinValue);
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
      const picks = rollUpgrades(this.upgradeLevels, 3);
      // Tout est au maximum : le niveau donne un soin à la place.
      if (picks.length === 0) player.heal(20);
      else this.pendingChoices = picks;
    }
  }

  /** Applique l'amélioration choisie et relance la partie. */
  choose(upgrade: Upgrade): void {
    if (!this.pendingChoices?.includes(upgrade)) return;
    upgrade.apply(this);
    this.upgradeLevels.set(upgrade.id, (this.upgradeLevels.get(upgrade.id) ?? 0) + 1);
    this.pendingChoices = null;
  }
}
