import * as THREE from 'three';
import type { Enemies, Enemy } from './enemies';
import type { Player } from './player';

interface Shot {
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  pierce: number;
  /** Ennemis déjà touchés, pour qu'un tir perforant ne frappe pas deux fois le même. */
  hit: Set<Enemy>;
}

const MAX_SHOTS = 200;
export const MAX_ORBS = 8;
/** Portée volontairement courte : les ennemis meurent près du héros, leurs gemmes restent accessibles. */
export const RANGE = 10;
const SHOT_SPEED = 18;
const SHOT_RADIUS = 0.2;
const SHOT_SPREAD = 0.2;
const ORB_DISTANCE = 2.4;
const ORB_RADIUS = 0.32;

/** Attaques automatiques du joueur : projectiles visant l'ennemi le plus proche + orbes orbitaux. */
export class Weapons {
  onShoot?: () => void;

  private shots: Shot[] = [];
  private cooldown = 0;
  private shotMesh: THREE.InstancedMesh;
  private orbMesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private p = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 2.2);

  constructor(scene: THREE.Scene) {
    this.shotMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(SHOT_RADIUS, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff27a }),
      MAX_SHOTS,
    );
    this.orbMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(ORB_RADIUS, 1),
      new THREE.MeshBasicMaterial({ color: 0x6fe9ff }),
      MAX_ORBS,
    );
    for (const mesh of [this.shotMesh, this.orbMesh]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
  }

  get shotCount(): number {
    return this.shots.length;
  }

  clear(): void {
    this.shots.length = 0;
    this.cooldown = 0;
    this.shotMesh.count = this.orbMesh.count = 0;
  }

  update(dt: number, time: number, player: Player, enemies: Enemies): void {
    const stats = player.stats;

    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      const target = enemies.nearest(player.x, player.z, RANGE);
      if (target) {
        this.fire(player, target);
        this.cooldown = stats.fireInterval;
        this.onShoot?.();
      } else {
        this.cooldown = 0;
      }
    }

    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.life -= dt;

      let dead = s.life <= 0;
      if (!dead) {
        for (const e of enemies.list) {
          if (e.hp <= 0 || s.hit.has(e)) continue;
          const reach = e.radius + SHOT_RADIUS;
          if ((e.x - s.x) ** 2 + (e.z - s.z) ** 2 > reach * reach) continue;
          enemies.hit(e, stats.damage, s.vx / SHOT_SPEED, s.vz / SHOT_SPEED);
          s.hit.add(e);
          if (s.pierce-- <= 0) {
            dead = true;
            break;
          }
        }
      }
      if (dead) {
        this.shots[i] = this.shots[this.shots.length - 1];
        this.shots.pop();
      }
    }

    const orbs = Math.min(stats.orbs, MAX_ORBS);
    for (let i = 0; i < orbs; i++) {
      const a = time * 2.6 + (i * Math.PI * 2) / orbs;
      const ox = player.x + Math.cos(a) * ORB_DISTANCE;
      const oz = player.z + Math.sin(a) * ORB_DISTANCE;
      for (const e of enemies.list) {
        if (e.hp <= 0 || e.orbCooldown > 0) continue;
        const reach = e.radius + ORB_RADIUS;
        const dx = e.x - ox;
        const dz = e.z - oz;
        if (dx * dx + dz * dz > reach * reach) continue;
        const d = Math.hypot(e.x - player.x, e.z - player.z) || 1;
        enemies.hit(e, stats.damage * 0.7, (e.x - player.x) / d, (e.z - player.z) / d);
        e.orbCooldown = 0.4;
      }
      this.orbMesh.setMatrixAt(i, this.m.makeTranslation(ox, 0.9, oz));
    }
    this.orbMesh.count = orbs;
    this.orbMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.shots.length; i++) {
      const s = this.shots[i];
      // Projectile étiré dans le sens du déplacement.
      this.p.set(s.x, 0.9, s.z);
      this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(s.vx, s.vz));
      this.shotMesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    }
    this.shotMesh.count = this.shots.length;
    this.shotMesh.instanceMatrix.needsUpdate = true;
  }

  private fire(player: Player, target: Enemy): void {
    const base = Math.atan2(target.z - player.z, target.x - player.x);
    const n = player.stats.projectiles;
    for (let i = 0; i < n && this.shots.length < MAX_SHOTS; i++) {
      // Les projectiles supplémentaires partent en éventail autour de la cible.
      const a = base + (i - (n - 1) / 2) * SHOT_SPREAD;
      this.shots.push({
        x: player.x,
        z: player.z,
        vx: Math.cos(a) * SHOT_SPEED,
        vz: Math.sin(a) * SHOT_SPEED,
        life: 1.2,
        pierce: player.stats.pierce,
        hit: new Set(),
      });
    }
  }
}
