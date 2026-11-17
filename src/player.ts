import * as THREE from 'three';
import { ARENA } from './world';

/** Caractéristiques du héros : fixées par la progression permanente, puis modifiées en partie. */
export interface Stats {
  maxHp: number;
  speed: number;
  damage: number;
  /** Multiplicateur du délai entre deux attaques de toutes les armes (plus petit = plus rapide). */
  cooldown: number;
  /** Rayon d'attraction des gemmes et des pièces. */
  magnet: number;
  /** PV régénérés par seconde. */
  regen: number;
  goldMult: number;
  xpMult: number;
}

export function baseStats(): Stats {
  return {
    maxHp: 100,
    speed: 6,
    damage: 10,
    cooldown: 1,
    magnet: 2.6,
    regen: 0,
    goldMult: 1,
    xpMult: 1,
  };
}

/** Direction voulue, longueur <= 1. `y` positif = vers le haut de l'écran. */
export interface MoveInput {
  x: number;
  y: number;
}

/** État de simulation du héros. Son apparence (modèle 3D) est gérée par `hero.ts`. */
export class Player {
  /** Porte la position et l'orientation ; le modèle 3D y est attaché. */
  readonly group = new THREE.Group();
  readonly radius = 0.45;
  stats = baseStats();
  hp = this.stats.maxHp;
  moving = false;
  /** Passe à true quand le joueur vient d'être touché (lu puis remis à false par la partie). */
  hurt = false;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  get x(): number {
    return this.group.position.x;
  }

  get z(): number {
    return this.group.position.z;
  }

  reset(stats: Stats): void {
    this.stats = { ...stats };
    this.hp = this.stats.maxHp;
    this.hurt = false;
    this.moving = false;
    this.group.position.set(0, 0, 0);
    this.group.rotation.y = 0;
  }

  takeDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
    this.hurt = true;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
  }

  update(dt: number, move: MoveInput): void {
    const { x, y } = move;
    const pos = this.group.position;
    this.moving = x !== 0 || y !== 0;

    if (this.moving) {
      // Haut de l'écran = -Z (la caméra regarde depuis +Z).
      pos.x = THREE.MathUtils.clamp(pos.x + x * this.stats.speed * dt, -ARENA, ARENA);
      pos.z = THREE.MathUtils.clamp(pos.z - y * this.stats.speed * dt, -ARENA, ARENA);

      // Rotation douce vers la direction de marche, par le plus court chemin.
      const target = Math.atan2(x, -y);
      let diff = target - this.group.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.group.rotation.y += diff * Math.min(1, dt * 14);
    }

    if (this.stats.regen > 0) this.heal(this.stats.regen * dt);
  }
}
