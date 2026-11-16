import * as THREE from 'three';
import type { Player } from './player';
import { random } from './rng';

export type PickupKind = 'xp' | 'gold';

interface Pickup {
  kind: PickupKind;
  x: number;
  z: number;
  value: number;
  phase: number;
  /** Un objet aimanté ne s'arrête plus, même si le joueur s'éloigne. */
  pulled: boolean;
}

const MAX_PER_KIND = 500;
const PULL_SPEED = 15;
const PICKUP_DISTANCE = 0.7;
const SMALL = new THREE.Color(0x3fe0ff);
const BIG = new THREE.Color(0xff6bd6);
const GOLD = new THREE.Color(0xffc93c);
const UP = new THREE.Vector3(0, 1, 0);

/** Objets à ramasser lâchés par les ennemis : gemmes d'XP et pièces d'or. */
export class Pickups {
  onPickup?: (kind: PickupKind, value: number) => void;

  private list: Pickup[] = [];
  private gems: THREE.InstancedMesh;
  private coins: THREE.InstancedMesh;
  private glows: THREE.InstancedMesh;
  private flat = new THREE.Quaternion();
  private m = new THREE.Matrix4();
  private p = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    // Losange allongé : une silhouette qui ne ressemble à rien d'autre sur le terrain.
    this.gems = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.3, 0).scale(1, 1.45, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      MAX_PER_KIND,
    );
    this.coins = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.08, 14).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      MAX_PER_KIND,
    );
    // Halo lumineux au sol sous chaque objet à ramasser.
    this.glows = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      MAX_PER_KIND * 2,
    );
    for (const mesh of [this.glows, this.gems, this.coins]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
  }

  get count(): number {
    return this.list.length;
  }

  clear(): void {
    this.list.length = 0;
    this.gems.count = this.coins.count = this.glows.count = 0;
  }

  spawn(kind: PickupKind, x: number, z: number, value: number): void {
    const same = this.list.filter((p) => p.kind === kind);
    if (same.length >= MAX_PER_KIND) {
      // Plafond atteint : on reporte la valeur sur un objet existant plutôt que de la perdre.
      same[Math.floor(random() * same.length)].value += value;
      return;
    }
    // Les pièces sont décalées pour ne pas être cachées par la gemme du même ennemi.
    const offset = kind === 'gold' ? 0.45 : 0;
    this.list.push({ kind, x: x + offset, z: z + offset, value, phase: random() * 6.28, pulled: false });
  }

  /** Déplace / ramasse les objets et renvoie ce qui a été gagné pendant cette frame. */
  update(dt: number, time: number, player: Player): { xp: number; gold: number } {
    const gained = { xp: 0, gold: 0 };
    const magnet2 = player.stats.magnet ** 2;

    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      const dx = player.x - g.x;
      const dz = player.z - g.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < magnet2) g.pulled = true;
      if (!g.pulled) continue;

      const d = Math.sqrt(d2) || 0.0001;
      const step = Math.min(d, PULL_SPEED * dt);
      g.x += (dx / d) * step;
      g.z += (dz / d) * step;
      if (d - step < PICKUP_DISTANCE) {
        gained[g.kind] += g.value;
        this.onPickup?.(g.kind, g.value);
        this.list[i] = this.list[this.list.length - 1];
        this.list.pop();
      }
    }

    let gems = 0;
    let coins = 0;
    let glows = 0;
    for (const g of this.list) {
      const big = g.value >= 5;
      const color = g.kind === 'gold' ? GOLD : big ? BIG : SMALL;
      const scale = big ? 1.5 : 1;

      // Halo pulsant posé juste au-dessus du sol.
      this.p.set(g.x, 0.03, g.z);
      this.s.setScalar(scale * (1 + Math.sin(time * 5 + g.phase) * 0.18));
      this.glows.setMatrixAt(glows, this.m.compose(this.p, this.flat, this.s));
      this.glows.setColorAt(glows++, color);

      this.p.set(g.x, 0.7 + Math.sin(time * 3 + g.phase) * 0.12, g.z);
      this.q.setFromAxisAngle(UP, time * 2.5 + g.phase);
      this.s.setScalar(scale);
      const mesh = g.kind === 'xp' ? this.gems : this.coins;
      const index = g.kind === 'xp' ? gems++ : coins++;
      mesh.setMatrixAt(index, this.m.compose(this.p, this.q, this.s));
      mesh.setColorAt(index, color);
    }
    this.gems.count = gems;
    this.coins.count = coins;
    this.glows.count = glows;
    for (const mesh of [this.glows, this.gems, this.coins]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    return gained;
  }
}
