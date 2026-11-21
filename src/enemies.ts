import * as THREE from 'three';
import { SeparationGrid, SpatialIndex } from './grid';
import type { Player } from './player';
import { rand, random } from './rng';
import { spawnOutside } from './spawn';
import { ARENA, FENCE, toonMaterial } from './world';

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
  /** Boss : n'apparaît jamais au hasard, mais par vagues (voir `Run`). */
  boss: boolean;
  /** Attaques d'un boss (vide pour les ennemis ordinaires). */
  attacks: BossAttack[];
}

type TypeDef = Omit<EnemyType, 'index' | 'color'> & { color: number };

const DEFS: TypeDef[] = [
  // Slime : l'ennemi de base.
  { id: 'slime', boss: false, attacks: [], color: 0x4fd66b, radius: 0.5, size: 1.0, hp: 8, speed: 2.2, damage: 9, xp: 1, coinChance: 0.18, coinValue: 1, from: 0, weight: 10, animSpeed: 1.3 },
  // Chauve-souris : petite, fragile, rapide.
  { id: 'bat', boss: false, attacks: [], color: 0xb46bff, radius: 0.4, size: 1.3, hp: 5, speed: 4.1, damage: 6, xp: 1, coinChance: 0.18, coinValue: 1, from: 30, weight: 4, animSpeed: 2.2 },
  // Orc : gros sac à PV qui lâche une grosse gemme et toujours des pièces.
  { id: 'orc', boss: false, attacks: [], color: 0x6fae4a, radius: 0.95, size: 2.3, hp: 70, speed: 1.6, damage: 21, xp: 6, coinChance: 1, coinValue: 5, from: 60, weight: 1, animSpeed: 1 },
  // Crâne : intermédiaire rapide et résistant.
  { id: 'skull', boss: false, attacks: [], color: 0xe9e4d4, radius: 0.55, size: 1.1, hp: 22, speed: 2.9, damage: 12, xp: 3, coinChance: 0.3, coinValue: 2, from: 90, weight: 3, animSpeed: 1.6 },
  // Boss : très résistants et rapides, avec des attaques annoncées (charge, onde de choc, salve de tirs). Jamais tirés au hasard (from: Infinity).
  { id: 'boss-orc', boss: true, attacks: ['charge', 'slam'], color: 0xd9482e, radius: 1.9, size: 4.4, hp: 600, speed: 3, damage: 20, xp: 12, coinChance: 0, coinValue: 0, from: Infinity, weight: 0, animSpeed: 0.8 },
  { id: 'boss-skull', boss: true, attacks: ['charge', 'volley'], color: 0x9b59d0, radius: 1.6, size: 3.8, hp: 520, speed: 3.6, damage: 18, xp: 12, coinChance: 0, coinValue: 0, from: Infinity, weight: 0, animSpeed: 1.1 },
];

export const ENEMY_TYPES: EnemyType[] = DEFS.map((def, index) => ({
  ...def,
  index,
  color: new THREE.Color(def.color),
}));

/** Les types de boss, dans l'ordre où ils se succèdent. */
export const BOSS_TYPES: EnemyType[] = ENEMY_TYPES.filter((t) => t.boss);

/** Attaques d'un boss : charge en ligne droite, onde de choc autour de lui, salve de projectiles. */
export type BossAttack = 'charge' | 'slam' | 'volley';

/** Comportement d'un boss : il marche, vise (en s'arrêtant, direction figée), puis passe à l'attaque prévue. */
export interface BossState {
  phase: 'walk' | 'aim' | 'charge';
  /** Prochaine attaque (ou attaque en cours). */
  attack: BossAttack;
  timer: number;
  dirX: number;
  dirZ: number;
}

/** Projectile lancé par un boss. */
interface Bolt {
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
}

/** Durées (s) : marche entre deux attaques, visée selon l'attaque (le joueur voit la zone ou la ligne menacée), charge. */
export const BOSS_WALK_TIME = 2.4;
export const BOSS_AIM_TIME: Record<BossAttack, number> = { charge: 0.9, slam: 1, volley: 0.7 };
export const BOSS_CHARGE_TIME = 0.7;
export const BOSS_CHARGE_SPEED = 15;
/** Onde de choc : rayon et dégâts (d'un coup, pas par seconde). */
export const BOSS_SLAM_RADIUS = 6.5;
export const BOSS_SLAM_DAMAGE = 24;
/** Salve : nombre de projectiles, vitesse, durée de vie (donc portée), dégâts par projectile. */
export const BOSS_VOLLEY_COUNT = 5;
const BOSS_VOLLEY_SPREAD = 0.3;
export const BOLT_SPEED = 11;
export const BOLT_LIFE = 2.2;
export const BOLT_DAMAGE = 12;
const BOLT_RADIUS = 0.3;
const MAX_BOLTS = 80;
const MAX_MARKERS = 8;

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
  /** PV au moment de l'apparition (pour les barres de vie des boss). */
  maxHp: number;
  type: EnemyType;
  radius: number;
  angle: number;
  /** Décalage dans le cycle d'animation, pour que les ennemis ne bougent pas tous en rythme. */
  phase: number;
  /** Présent uniquement pour les boss. */
  boss?: BossState;
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

/**
 * Multiplicateur des dégâts des ennemis selon le temps de partie (en secondes).
 * Croissance régulière, puis qui s'accélère passé 3 minutes : un héros très amélioré
 * ne peut pas rester invulnérable indéfiniment.
 */
export function enemyDamageScale(time: number): number {
  const late = Math.max(0, time - 180) / 120;
  return 1 + time / 150 + late * late;
}

/** Réglages de difficulté appliqués aux ennemis (1 = normal). */
export interface EnemyMods {
  /** Multiplie la cadence d'apparition. */
  count: number;
  /** Multiplie les PV. */
  hp: number;
  /** Multiplie les dégâts de contact. */
  damage: number;
}

export const NO_MODS: EnemyMods = { count: 1, hp: 1, damage: 1 };

export const MAX_ENEMIES = 300;
/** Marge entre la clôture et un ennemi qui apparaît : il est entièrement dehors, corps compris. */
const SPAWN_GAP = 1;
/** Demi-largeur des grilles de recherche : l'arène, la clôture et ce qui se trouve derrière (les boss y arrivent par l'extérieur). */
const GRID_HALF = ARENA + 40;
const DEATH_TIME = 0.22;
const FLASH = new THREE.Color(3, 3, 3);
const UP = new THREE.Vector3(0, 1, 0);

/** Plus grand rayon d'ennemi (un boss) : fixe la taille des cases de la grille de séparation. */
const MAX_ENEMY_RADIUS = Math.max(...ENEMY_TYPES.map((t) => t.radius));

export class Enemies {
  readonly list: Enemy[] = [];
  /** Les ennemis restent dans l'arène élargie de leur distance d'apparition ; au-delà, la grille les range au bord, sans erreur. */
  private grid = new SeparationGrid(MAX_ENEMY_RADIUS, GRID_HALF, MAX_ENEMIES);
  /** Index pour les recherches des armes (voir `nearby`). */
  private index = new SpatialIndex(MAX_ENEMY_RADIUS, GRID_HALF, MAX_ENEMIES);
  /** Résultat de la dernière recherche `nearby` : indices dans `list`, par ordre croissant. */
  nearIds = new Int32Array(MAX_ENEMIES);
  onHit?: (e: Enemy, damage: number) => void;

  private corpses: Corpse[] = [];
  /** meshes[type][image] : chaque image d'animation est un InstancedMesh partagé. */
  private meshes: THREE.InstancedMesh[][];
  private visuals: EnemyVisual[];
  private spawnBudget = 0;
  /** Ombre ronde sous chaque ennemi : les sépare du sol et de leurs voisins. */
  private shadows: THREE.InstancedMesh;
  /** Annonces au sol des attaques de boss : bandes (charge, salve) et disques (onde de choc). */
  private markers: THREE.InstancedMesh;
  private discs: THREE.InstancedMesh;
  private bolts: Bolt[] = [];
  private boltMesh: THREE.InstancedMesh;
  /** Une onde de choc de boss vient de frapper. */
  onSlam?: (boss: Enemy, radius: number) => void;
  /** Un boss vient de tirer une salve. */
  onFire?: (boss: Enemy) => void;
  /** Difficulté de la partie en cours. */
  mods: EnemyMods = NO_MODS;

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
        // Pas d'ombre portée pour les ennemis (jusqu'à 300 dessinés une seconde fois) : le disque d'ombre au sol suffit.
        mesh.castShadow = false;
        mesh.frustumCulled = false;
        scene.add(mesh);
        return mesh;
      }),
    );

    this.shadows = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x10240f, transparent: true, opacity: 0.38, depthWrite: false }),
      MAX_ENEMIES,
    );
    this.markers = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.03, 1),
      new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.4, depthWrite: false }),
      MAX_MARKERS,
    );
    this.markers.count = 0;
    this.markers.frustumCulled = false;
    scene.add(this.markers);

    this.discs = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.3, depthWrite: false }),
      MAX_MARKERS,
    );
    this.discs.count = 0;
    this.discs.frustumCulled = false;
    scene.add(this.discs);

    this.boltMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(BOLT_RADIUS, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff5a8a }),
      MAX_BOLTS,
    );
    this.boltMesh.count = 0;
    this.boltMesh.frustumCulled = false;
    scene.add(this.boltMesh);

    this.shadows.position.y = 0.03;
    this.shadows.count = 0;
    this.shadows.frustumCulled = false;
    scene.add(this.shadows);
  }

  clear(): void {
    this.list.length = 0;
    this.corpses.length = 0;
    this.spawnBudget = 0;
    this.markers.count = this.discs.count = this.boltMesh.count = 0;
    this.bolts.length = 0;
    this.sync(0);
  }

  /** Nombre de boss vivants. */
  get bossCount(): number {
    return this.list.filter((e) => e.boss).length;
  }

  update(dt: number, time: number, player: Player): void {
    // La cadence d'apparition augmente avec le temps de partie.
    this.spawnBudget += dt * (1 + time / 16) * this.mods.count;
    while (this.spawnBudget >= 1) {
      this.spawnBudget -= 1;
      if (this.list.length < MAX_ENEMIES) this.spawn(time, player.x, player.z);
    }

    const damageScale = enemyDamageScale(time) * this.mods.damage;
    const px = player.x;
    const pz = player.z;
    for (const e of this.list) {
      if (e.boss) {
        this.updateBoss(e, dt, player, damageScale);
        continue;
      }
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
        player.takeDamage(e.type.damage * damageScale * dt);
        // L'ennemi reste collé au bord du joueur au lieu de le traverser.
        e.x = px - (dx / d) * reach;
        e.z = pz - (dz / d) * reach;
      }
      e.flash -= dt;
      e.orbCooldown -= dt;
    }

    // Projectiles des boss : avancent en ligne droite, blessent le héros au contact.
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];
      bolt.x += bolt.vx * dt;
      bolt.z += bolt.vz * dt;
      bolt.life -= dt;
      const reach = BOLT_RADIUS + player.radius;
      const hit = (bolt.x - px) ** 2 + (bolt.z - pz) ** 2 < reach * reach;
      if (hit) player.takeDamage(BOLT_DAMAGE * damageScale);
      if (hit || bolt.life <= 0) {
        this.bolts[i] = this.bolts[this.bolts.length - 1];
        this.bolts.pop();
      }
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

  /** Boss : marche vers le joueur, s'arrête pour viser, puis lance l'attaque prévue. */
  private updateBoss(e: Enemy, dt: number, player: Player, damageScale: number): void {
    const b = e.boss!;
    const dx = player.x - e.x;
    const dz = player.z - e.z;
    const d = Math.hypot(dx, dz) || 0.0001;
    b.timer -= dt;
    let vx = 0;
    let vz = 0;
    if (b.phase === 'walk') {
      e.angle = Math.atan2(dx, dz);
      vx = (dx / d) * e.type.speed;
      vz = (dz / d) * e.type.speed;
      if (b.timer <= 0) {
        // Une onde de choc n'a de sens que de près : sinon le boss charge pour se rapprocher.
        if (b.attack === 'slam' && d > BOSS_SLAM_RADIUS * 1.8) b.attack = 'charge';
        // La direction est figée au début de la visée : le joueur peut s'écarter.
        b.phase = 'aim';
        b.timer = BOSS_AIM_TIME[b.attack];
        b.dirX = dx / d;
        b.dirZ = dz / d;
      }
    } else if (b.phase === 'aim') {
      e.angle = Math.atan2(b.dirX, b.dirZ);
      if (b.timer <= 0) {
        if (b.attack === 'charge') {
          b.phase = 'charge';
          b.timer = BOSS_CHARGE_TIME;
        } else {
          if (b.attack === 'slam') this.slam(e, player, damageScale);
          else this.volley(e, b);
          this.endAttack(e, b);
        }
      }
    } else {
      e.angle = Math.atan2(b.dirX, b.dirZ);
      vx = b.dirX * BOSS_CHARGE_SPEED;
      vz = b.dirZ * BOSS_CHARGE_SPEED;
      if (b.timer <= 0) this.endAttack(e, b);
    }
    // Un boss ne s'éloigne pas de l'arène, mais celui qui apparaît derrière la clôture doit pouvoir y entrer : sa limite
    // est sa position du moment si elle est plus large (il ne peut qu'aller vers l'intérieur, ou rester).
    const limitX = Math.max(ARENA + 2, Math.abs(e.x));
    const limitZ = Math.max(ARENA + 2, Math.abs(e.z));
    e.x = Math.max(-limitX, Math.min(limitX, e.x + vx * dt));
    e.z = Math.max(-limitZ, Math.min(limitZ, e.z + vz * dt));

    // Contact évalué après le déplacement, comme pour les autres ennemis.
    const reach = e.radius + player.radius;
    const ex = player.x - e.x;
    const ez = player.z - e.z;
    const dist = Math.hypot(ex, ez) || 0.0001;
    if (dist < reach) {
      player.takeDamage(e.type.damage * damageScale * dt);
      e.x = player.x - (ex / dist) * reach;
      e.z = player.z - (ez / dist) * reach;
    }
    e.flash -= dt;
    e.orbCooldown -= dt;
  }

  /** Fin d'une attaque : retour à la marche, et choix de la suivante. */
  private endAttack(e: Enemy, b: BossState): void {
    b.phase = 'walk';
    b.timer = BOSS_WALK_TIME;
    const options = e.type.attacks;
    b.attack = options[Math.floor(random() * options.length)] ?? 'charge';
  }

  /** Onde de choc : blesse d'un coup tout ce qui est dans le rayon autour du boss. */
  private slam(e: Enemy, player: Player, damageScale: number): void {
    const dist = Math.hypot(player.x - e.x, player.z - e.z);
    if (dist < BOSS_SLAM_RADIUS + player.radius) player.takeDamage(BOSS_SLAM_DAMAGE * damageScale);
    this.onSlam?.(e, BOSS_SLAM_RADIUS);
  }

  /** Salve : un éventail de projectiles dans la direction visée. */
  private volley(e: Enemy, b: BossState): void {
    const base = Math.atan2(b.dirZ, b.dirX);
    for (let i = 0; i < BOSS_VOLLEY_COUNT && this.bolts.length < MAX_BOLTS; i++) {
      const a = base + (i - (BOSS_VOLLEY_COUNT - 1) / 2) * BOSS_VOLLEY_SPREAD;
      this.bolts.push({ x: e.x, z: e.z, vx: Math.cos(a) * BOLT_SPEED, vz: Math.sin(a) * BOLT_SPEED, life: BOLT_LIFE });
    }
    this.onFire?.(e);
  }

  /** Nombre de projectiles de boss en vol. */
  get boltCount(): number {
    return this.bolts.length;
  }

  /** Range les ennemis dans l'index des recherches. À appeler une fois par image, quand ils ont fini de bouger. */
  reindex(): void {
    this.index.rebuild(this.list);
  }

  /**
   * Ennemis qui peuvent être touchés par un cercle de rayon `reach` centré en (x, z), sans parcourir toute la liste :
   * leurs indices sont écrits dans `nearIds` (ordre de la liste), et leur nombre est renvoyé. L'appelant fait le test exact,
   * qui donne le même résultat qu'un parcours complet de `list`.
   */
  nearby(x: number, z: number, reach: number): number {
    // Garde-fou : un ennemi apparu ou retiré depuis le rangement (tests, appels hors de la boucle de jeu).
    if (this.index.count !== this.list.length) this.index.rebuild(this.list);
    if (this.nearIds.length < this.list.length) this.nearIds = new Int32Array(this.list.length);
    return this.index.query(x, z, reach, this.nearIds);
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
    // Le recul déplace l'ennemi après son rangement dans l'index : on en tient compte (borne, sans racine carrée).
    this.index.noteMove(knock * (Math.abs(dirX) + Math.abs(dirZ)));
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

    const hp = type.hp * (1 + time / 90) * this.mods.hp;
    // À l'extérieur de la clôture, dans une direction tirée autour du héros (voir src/spawn.ts).
    const at = spawnOutside(aroundX, aroundZ, FENCE + type.radius + SPAWN_GAP, () => rand(0, Math.PI * 2));
    const enemy: Enemy = {
      x: at.x,
      z: at.z,
      hp,
      maxHp: hp,
      type,
      radius: type.radius,
      angle: 0,
      phase: random(),
      flash: 0,
      orbCooldown: 0,
    };
    if (type.boss) {
      enemy.boss = {
        phase: 'walk',
        attack: type.attacks[Math.floor(random() * type.attacks.length)] ?? 'charge',
        timer: BOSS_WALK_TIME * (0.5 + random() * 0.5),
        dirX: 0,
        dirZ: 0,
      };
    }
    this.list.push(enemy);
    return enemy;
  }

  /** Empêche les ennemis de s'empiler au même endroit. */
  private separate(): void {
    // Grille spatiale : seuls les ennemis des cases voisines sont comparés (voir src/grid.ts), au lieu de toutes les paires.
    this.grid.separate(this.list);
  }

  private placeShadow(index: number, x: number, z: number, radius: number): void {
    this.p.set(x, 0, z);
    this.s.set(radius, 1, radius);
    this.shadows.setMatrixAt(index, this.m.compose(this.p, this.q.identity(), this.s));
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
    let shadows = 0;

    for (const e of this.list) {
      const visual = this.visuals[e.type.index];
      // Chaque ennemi a sa propre taille (±10 %), tirée de sa phase : la foule est moins uniforme.
      const size = e.boss ? 1 : 0.92 + e.phase * 0.2;
      let sx = size;
      let sy = size;
      if (visual.frames.length === 1) {
        // Pas d'animation de modèle : effet "gelée" procédural.
        const squash = Math.sin(time * 7 + e.phase * 6.28) * 0.1;
        sx = size * (1 - squash * 0.5);
        sy = size * (1 + squash);
      }
      // Coup reçu : l'ennemi s'écrase brièvement.
      if (e.flash > 0) {
        sx *= 1.18;
        sy *= 0.84;
      }
      this.placeShadow(shadows++, e.x, e.z, e.radius * 1.15 * size);
      const cycle = time * e.type.animSpeed + e.phase;
      this.place(e.type, cycle, e.x, e.z, e.angle, sx, sy, e.flash > 0 ? FLASH : visual.tint);
    }

    // Annonces au sol des attaques de boss pendant la visée.
    let strips = 0;
    let discs = 0;
    for (const e of this.list) {
      const b = e.boss;
      if (!b || b.phase !== 'aim') continue;
      if (b.attack === 'slam') {
        if (discs >= MAX_MARKERS) continue;
        this.p.set(e.x, 0.045, e.z);
        this.s.set(BOSS_SLAM_RADIUS, 1, BOSS_SLAM_RADIUS);
        this.discs.setMatrixAt(discs++, this.m.compose(this.p, this.q.identity(), this.s));
        continue;
      }
      if (strips >= MAX_MARKERS) continue;
      const charge = b.attack === 'charge';
      const length = charge ? BOSS_CHARGE_SPEED * BOSS_CHARGE_TIME + e.radius : BOLT_SPEED * BOLT_LIFE;
      this.p.set(e.x + b.dirX * (length / 2), 0.04, e.z + b.dirZ * (length / 2));
      this.q.setFromAxisAngle(UP, Math.atan2(b.dirX, b.dirZ));
      this.s.set(charge ? e.radius * 1.7 : 0.9, 1, length);
      this.markers.setMatrixAt(strips++, this.m.compose(this.p, this.q, this.s));
    }
    this.markers.count = strips;
    this.discs.count = discs;
    this.markers.instanceMatrix.needsUpdate = true;
    this.discs.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.bolts.length; i++) {
      this.p.set(this.bolts[i].x, 0.9, this.bolts[i].z);
      this.boltMesh.setMatrixAt(i, this.m.compose(this.p, this.q.identity(), this.s.setScalar(1)));
    }
    this.boltMesh.count = this.bolts.length;
    this.boltMesh.instanceMatrix.needsUpdate = true;

    this.shadows.count = shadows;
    this.shadows.instanceMatrix.clearUpdateRanges();
    this.shadows.instanceMatrix.addUpdateRange(0, shadows * 16);
    this.shadows.instanceMatrix.needsUpdate = true;

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
