import * as THREE from 'three';
import type { Player } from './player';
import { rand, random } from './rng';
import { toonMaterial } from './world';

export interface EnemyType {
  index: number;
  id: string;
  /** Couleur dominante : particules, et teinte du modèle de secours. */
  color: THREE.Color;
  /** Rayon de collision. */
  radius: number;
  /** Taille visuelle du modèle (hauteur, ou envergure pour les volants). */
  size: number;
  hp: number;
  speed: number;
  /** Dégâts par seconde au contact. */
  damage: number;
  xp: number;
  coinChance: number;
  coinValue: number;
  /** Seconde de partie à partir de laquelle ce type apparaît. */
  from: number;
  weight: number;
  /** Cycles d'animation par seconde. */
  animSpeed: number;
}

type TypeDef = Omit<EnemyType, 'index' | 'color'> & { color: number };

const DEFS: TypeDef[] = [
  // Slime : l'ennemi de base.
  { id: 'slime', color: 0x4fd66b, radius: 0.5, size: 1.0, hp: 8, speed: 2.2, damage: 6, xp: 1, coinChance: 0.18, coinValue: 1, from: 0, weight: 10, animSpeed: 1.3 },
  // Chauve-souris : petite, fragile, rapide.
  { id: 'bat', color: 0xb46bff, radius: 0.4, size: 1.3, hp: 5, speed: 4.1, damage: 4, xp: 1, coinChance: 0.18, coinValue: 1, from: 30, weight: 4, animSpeed: 2.2 },
  // Orc : gros sac à PV qui lâche une grosse gemme et toujours des pièces.
  { id: 'orc', color: 0x6fae4a, radius: 0.95, size: 2.3, hp: 70, speed: 1.6, damage: 14, xp: 6, coinChance: 1, coinValue: 5, from: 60, weight: 1, animSpeed: 1 },
  // Crâne : intermédiaire rapide et résistant.
  { id: 'skull', color: 0xe9e4d4, radius: 0.55, size: 1.1, hp: 22, speed: 2.9, damage: 8, xp: 3, coinChance: 0.3, coinValue: 2, from: 90, weight: 3, animSpeed: 1.6 },
];

export const ENEMY_TYPES: EnemyType[] = DEFS.map((def, index) => ({
  ...def,
  index,
  color: new THREE.Color(def.color),
}));

/** Apparence d'un type d'ennemi : une géométrie par image d'animation. */
export interface EnemyVisual {
  frames: THREE.BufferGeometry[];
  material: THREE.Material;
  /** Couleur d'instance en temps normal (blanc = couleurs du modèle inchangées). */
  tint: THREE.Color;
}

export type EnemyVisuals = Record<string, EnemyVisual>;

/** Apparence de secours (boule colorée), utilisée par les tests et si un modèle ne charge pas. */
export function placeholderVisual(type: EnemyType): EnemyVisual {
  const geo = new THREE.SphereGeometry(0.5, 16, 12)
    .scale(1, 0.8, 1)
    .translate(0, 0.4, 0)
    .scale(type.radius * 2, type.radius * 2, type.radius * 2);
  return { frames: [geo], material: toonMaterial(0xffffff), tint: type.color };
}

export function placeholderVisuals(): EnemyVisuals {
  return Object.fromEntries(ENEMY_TYPES.map((t) => [t.id, placeholderVisual(t)]));
}

export interface Enemy {
  x: number;
  z: number;
  hp: number;
  type: EnemyType;
  radius: number;
  angle: number;
  /** Décalage dans le cycle d'animation, pour que les ennemis ne bougent pas tous en rythme. */
  phase: number;
  /** Temps restant du flash blanc après un coup. */
  flash: number;
  /** Temps avant de pouvoir être retouché par un orbe. */
  orbCooldown: number;
}

/** Ennemi mort, encore affiché le temps d'une courte animation de disparition. */
interface Corpse {
  x: number;
  z: number;
  type: EnemyType;
  angle: number;
  frame: number;
  age: number;
}

export const MAX_ENEMIES = 300;
const SPAWN_DISTANCE = 26;
const DEATH_TIME = 0.22;
const FLASH = new THREE.Color(3, 3, 3);
const UP = new THREE.Vector3(0, 1, 0);

export class Enemies {
  readonly list: Enemy[] = [];
  onHit?: (e: Enemy, damage: number) => void;

  private corpses: Corpse[] = [];
  /** meshes[type][image] : chaque image d'animation est un InstancedMesh partagé. */
  private meshes: THREE.InstancedMesh[][];
  private visuals: EnemyVisual[];
  private spawnBudget = 0;

  private m = new THREE.Matrix4();
  private p = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();

  constructor(scene: THREE.Scene, visuals: EnemyVisuals) {
    this.visuals = ENEMY_TYPES.map((t) => visuals[t.id] ?? placeholderVisual(t));
    this.meshes = this.visuals.map((visual) =>
      visual.frames.map((geometry) => {
        const mesh = new THREE.InstancedMesh(geometry, visual.material, MAX_ENEMIES);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.setColorAt(0, visual.tint);
        mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        mesh.visible = false;
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        scene.add(mesh);
        return mesh;
      }),
    );
  }

  clear(): void {
    this.list.length = 0;
    this.corpses.length = 0;
    this.spawnBudget = 0;
    this.sync(0);
  }

  update(dt: number, time: number, player: Player): void {
    // La cadence d'apparition augmente avec le temps de partie.
    this.spawnBudget += dt * (0.9 + time / 22);
    while (this.spawnBudget >= 1) {
      this.spawnBudget -= 1;
      if (this.list.length < MAX_ENEMIES) this.spawn(time, player.x, player.z);
    }

    const px = player.x;
    const pz = player.z;
    for (const e of this.list) {
      const dx = px - e.x;
      const dz = pz - e.z;
      const d = Math.hypot(dx, dz) || 0.0001;
      e.angle = Math.atan2(dx, dz);
      const step = e.type.speed * dt;
      e.x += (dx / d) * step;
      e.z += (dz / d) * step;

      // Contact évalué après le déplacement : sinon l'ennemi, replacé pile au bord,
      // ne toucherait qu'une image sur deux.
      const reach = e.radius + player.radius;
      if (d - step < reach) {
        player.takeDamage(e.type.damage * dt);
        // L'ennemi reste collé au bord du joueur au lieu de le traverser.
        e.x = px - (dx / d) * reach;
        e.z = pz - (dz / d) * reach;
      }
      e.flash -= dt;
      e.orbCooldown -= dt;
    }

    for (let i = this.corpses.length - 1; i >= 0; i--) {
      this.corpses[i].age += dt;
      if (this.corpses[i].age >= DEATH_TIME) {
        this.corpses[i] = this.corpses[this.corpses.length - 1];
        this.corpses.pop();
      }
    }

    this.separate();
    this.sync(time);
  }

  /** Ennemi vivant le plus proche dans le rayon donné. */
  nearest(x: number, z: number, range: number): Enemy | null {
    let best: Enemy | null = null;
    let bestD = range * range;
    for (const e of this.list) {
      if (e.hp <= 0) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** Inflige des dégâts avec un léger recul dans la direction (dirX, dirZ). */
  hit(e: Enemy, damage: number, dirX: number, dirZ: number): void {
    e.hp -= damage;
    e.flash = 0.1;
    const knock = 0.18 / e.radius;
    e.x += dirX * knock;
    e.z += dirZ * knock;
    this.onHit?.(e, damage);
  }

  /** Retire les ennemis morts et appelle `onDeath` pour chacun. */
  sweepDead(onDeath: (e: Enemy) => void): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.hp > 0) continue;
      onDeath(e);
      this.corpses.push({ x: e.x, z: e.z, type: e.type, angle: e.angle, frame: e.phase, age: 0 });
      this.list[i] = this.list[this.list.length - 1];
      this.list.pop();
    }
  }

  /** Fait apparaître un ennemi autour du point donné (ou d'un type précis, pour les tests). */
  spawn(time: number, aroundX: number, aroundZ: number, forced?: EnemyType): Enemy {
    let type = forced;
    if (!type) {
      const available = ENEMY_TYPES.filter((t) => t.from <= time);
      let roll = random() * available.reduce((sum, t) => sum + t.weight, 0);
      type = available[0];
      for (const t of available) {
        roll -= t.weight;
        if (roll <= 0) {
          type = t;
          break;
        }
      }
    }

    const angle = rand(0, Math.PI * 2);
    const enemy: Enemy = {
      x: aroundX + Math.cos(angle) * SPAWN_DISTANCE,
      z: aroundZ + Math.sin(angle) * SPAWN_DISTANCE,
      hp: type.hp * (1 + time / 90),
      type,
      radius: type.radius,
      angle: 0,
      phase: random(),
      flash: 0,
      orbCooldown: 0,
    };
    this.list.push(enemy);
    return enemy;
  }

  /** Empêche les ennemis de s'empiler au même endroit. */
  private separate(): void {
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / d / 2;
        a.x -= dx * push;
        a.z -= dz * push;
        b.x += dx * push;
        b.z += dz * push;
      }
    }
  }

  /** Ajoute une instance à l'image d'animation correspondant à `cycle` (0..1). */
  private place(type: EnemyType, cycle: number, x: number, z: number, angle: number, sx: number, sy: number, color: THREE.Color): void {
    const frames = this.meshes[type.index];
    const mesh = frames[Math.floor((cycle % 1) * frames.length) % frames.length];
    if (mesh.count >= MAX_ENEMIES) return;
    this.p.set(x, 0, z);
    this.q.setFromAxisAngle(UP, angle);
    this.s.set(sx, sy, sx);
    mesh.setMatrixAt(mesh.count, this.m.compose(this.p, this.q, this.s));
    mesh.setColorAt(mesh.count, color);
    mesh.count++;
  }

  /** Recopie l'état de simulation dans les matrices d'instances. */
  private sync(time: number): void {
    for (const frames of this.meshes) for (const mesh of frames) mesh.count = 0;

    for (const e of this.list) {
      const visual = this.visuals[e.type.index];
      let sx = 1;
      let sy = 1;
      if (visual.frames.length === 1) {
        // Pas d'animation de modèle : effet "gelée" procédural.
        const squash = Math.sin(time * 7 + e.phase * 6.28) * 0.1;
        sx = 1 - squash * 0.5;
        sy = 1 + squash;
      }
      const cycle = time * e.type.animSpeed + e.phase;
      this.place(e.type, cycle, e.x, e.z, e.angle, sx, sy, e.flash > 0 ? FLASH : visual.tint);
    }

    for (const c of this.corpses) {
      // Disparition : l'ennemi s'aplatit et rétrécit en flashant.
      const k = c.age / DEATH_TIME;
      this.place(c.type, c.frame, c.x, c.z, c.angle, 1 + k * 0.5 - k * k * 1.5, 1 - k, FLASH);
    }

    for (const frames of this.meshes) {
      for (const mesh of frames) {
        mesh.visible = mesh.count > 0;
        if (!mesh.visible) continue;
        // On n'envoie au GPU que la partie utilisée des tampons.
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
        mesh.instanceMatrix.needsUpdate = true;
        const colors = mesh.instanceColor!;
        colors.clearUpdateRanges();
        colors.addUpdateRange(0, mesh.count * 3);
        colors.needsUpdate = true;
      }
    }
  }
}
