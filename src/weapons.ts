import * as THREE from 'three';
import type { Enemies, Enemy } from './enemies';
import type { Player } from './player';
import { rand } from './rng';
import { weaponDef, type WeaponLevel } from './weaponData';

type ShotKind = 'rifle' | 'spear';

interface Shot {
  kind: ShotKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  speed: number;
  radius: number;
  damage: number;
  life: number;
  pierce: number;
  /** Ennemis déjà touchés, pour qu'un tir perforant ne frappe pas deux fois le même. */
  hit: Set<Enemy>;
}

const MAX_SHOTS = 200;
export const MAX_ORBS = 8;
/** Portée volontairement courte : les ennemis meurent près du héros, leurs gemmes restent accessibles. */
export const RANGE = 10;
/** La lance part de plus loin : elle est lente à recharger. */
const SPEAR_RANGE = 14;
const RIFLE = { speed: 18, radius: 0.2, life: 1.2, spread: 0.2 };
const SPEAR = { speed: 22, life: 0.9, spread: 0.3 };
const ORB_RADIUS = 0.32;
const ORB_SPEED = 2.6;
/** Durée de l'anneau qui se propage à chaque pulsation de l'aura. */
const RING_TIME = 0.3;
/** Mines : armées après un court délai, elles explosent quand un ennemi s'approche, ou à la fin de leur durée de vie. */
const MINE_ARM_TIME = 0.6;
const MINE_LIFE = 9;
const MINE_TRIGGER = 1.3;
const MINE_RADIUS = 0.32;
const MAX_MINES = 40;
/** Distance à parcourir entre deux poses : on sème un chemin de mines, pas un tas. */
export const MINE_SPACING = 1.8;
/** Les mines sont posées derrière le héros, pas sous ses pieds. */
const MINE_BEHIND = 0.9;
const MINE_IDLE = new THREE.Color(0x6b7280);
const MINE_ARMED = new THREE.Color(0xff4d3a);
const MINE_BLINK = new THREE.Color(0x2a2f45);
const BULLET_COLOR = new THREE.Color(0xfff27a);
const SPEAR_COLOR = new THREE.Color(0xff9d4d);

/** Apparence choisie dans la collection : nombre = couleur fixe, 'rainbow' = arc-en-ciel, null = d'origine. */
export interface WeaponStyle {
  projectile: number | 'rainbow' | null;
  trail: number | 'rainbow' | null;
}

interface Mine {
  x: number;
  z: number;
  age: number;
  damage: number;
  area: number;
}

const TRAIL_COLORS: Record<ShotKind, THREE.Color> = { rifle: new THREE.Color(0xffb347), spear: new THREE.Color(0x9fe6ff) };

/**
 * Armes automatiques du joueur. Chaque arme possède un niveau (0 = non possédée) ;
 * ses valeurs viennent de `weaponData.ts`, les dégâts et la cadence sont modulés par les caractéristiques du héros.
 */
export class Weapons {
  /** Un projectile part : arme, position du héros et direction (radians, dans le plan du sol). */
  onShoot?: (weapon: string, x: number, z: number, angle: number) => void;
  /** L'aura vient de pulser autour du point donné. */
  onPulse?: (x: number, z: number, radius: number) => void;
  /** Une mine vient d'exploser. */
  onBlast?: (x: number, z: number, radius: number) => void;
  /** Apparence des projectiles et de leur traînée. */
  style: WeaponStyle = { projectile: null, trail: null };

  private levels = new Map<string, number>();
  private timers = new Map<string, number>();
  private shots: Shot[] = [];
  private shotMesh: THREE.InstancedMesh;
  private spearMesh: THREE.InstancedMesh;
  private orbMesh: THREE.InstancedMesh;
  private haloMesh: THREE.InstancedMesh;
  private mines: Mine[] = [];
  /** Où la dernière pose a eu lieu (null : pas encore de pose). */
  private lastMineDrop: { x: number; z: number } | null = null;
  private mineMesh: THREE.InstancedMesh;
  private tint = new THREE.Color();
  /** Traînée lumineuse derrière chaque projectile. */
  private trailMesh: THREE.InstancedMesh;
  private auraDisc: THREE.Mesh;
  private auraRing: THREE.Mesh;
  /** Avancement de l'anneau de la dernière pulsation (1 = terminé). */
  private ringAge = 1;
  private m = new THREE.Matrix4();
  private p = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.shotMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(RIFLE.radius, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff27a }),
      MAX_SHOTS,
    );
    // Pointe vers +Z, comme la direction de tir.
    this.spearMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.25, 1.8, 8).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff9d4d }),
      MAX_SHOTS,
    );
    this.orbMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(ORB_RADIUS, 1),
      new THREE.MeshBasicMaterial({ color: 0x6fe9ff }),
      MAX_ORBS,
    );
    // Lueur autour des orbes et traînée des projectiles : additifs, donc lumineux sur le sol sombre.
    const glow = (color: number, opacity: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    this.haloMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(ORB_RADIUS * 2, 12, 8), glow(0x6fe9ff, 0.28), MAX_ORBS);
    // Cône dont la pointe regarde vers l'arrière (-Z) : posé derrière le projectile, il dessine sa traînée.
    this.trailMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 8).rotateX(-Math.PI / 2), glow(0xffffff, 0.6), MAX_SHOTS);
    this.mineMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(MINE_RADIUS, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_MINES);
    for (const mesh of [this.shotMesh, this.spearMesh, this.orbMesh, this.haloMesh, this.trailMesh, this.mineMesh]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }

    const flat = (geometry: THREE.BufferGeometry) => geometry.rotateX(-Math.PI / 2);
    this.auraDisc = new THREE.Mesh(
      flat(new THREE.CircleGeometry(1, 48)),
      new THREE.MeshBasicMaterial({ color: 0xff7a2e, transparent: true, opacity: 0.14, depthWrite: false }),
    );
    this.auraRing = new THREE.Mesh(
      flat(new THREE.RingGeometry(0.9, 1, 64)),
      new THREE.MeshBasicMaterial({ color: 0xffc15e, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.auraDisc.position.y = 0.05;
    this.auraRing.position.y = 0.07;
    this.auraDisc.visible = this.auraRing.visible = false;
    scene.add(this.auraDisc, this.auraRing);
  }

  /** Projectiles (balles et lances) actuellement en vol. */
  get shotCount(): number {
    return this.shots.length;
  }

  /** Identifiants des armes possédées. */
  /** Mines posées, pas encore explosées. */
  get mineCount(): number {
    return this.mines.length;
  }

  get owned(): string[] {
    return [...this.levels.keys()];
  }

  /** Niveau d'une arme, 0 si elle n'est pas possédée. */
  level(id: string): number {
    return this.levels.get(id) ?? 0;
  }

  /** Donne une arme (niveau 1) ou la fait monter d'un niveau. Renvoie le nouveau niveau, 0 si l'arme n'existe pas ou est au maximum. */
  levelUp(id: string): number {
    const def = weaponDef(id);
    if (!def) return 0;
    const next = this.level(id) + 1;
    if (next > def.levels.length) return 0;
    this.levels.set(id, next);
    if (next === 1) this.timers.set(id, 0);
    return next;
  }

  clear(): void {
    this.levels.clear();
    this.timers.clear();
    this.shots.length = 0;
    this.mines.length = 0;
    this.lastMineDrop = null;
    this.mineMesh.count = 0;
    this.ringAge = 1;
    this.shotMesh.count = this.spearMesh.count = this.orbMesh.count = this.haloMesh.count = this.trailMesh.count = 0;
    this.auraDisc.visible = this.auraRing.visible = false;
  }

  update(dt: number, time: number, player: Player, enemies: Enemies): void {
    this.launcher('rifle', dt, player, enemies, RANGE);
    this.launcher('spear', dt, player, enemies, SPEAR_RANGE);
    this.moveShots(dt, enemies);
    this.updateOrbs(time, player, enemies);
    this.updateAura(dt, player, enemies);
    this.updateMines(dt, time, player, enemies);
    this.render(time);
  }

  /** Mesure d'une arme possédée à son niveau actuel. */
  private stats(id: string): WeaponLevel | null {
    const level = this.level(id);
    return level > 0 ? (weaponDef(id)?.levels[level - 1] ?? null) : null;
  }

  /** Armes qui tirent sur l'ennemi le plus proche : carabine et lance. */
  private launcher(id: ShotKind, dt: number, player: Player, enemies: Enemies, range: number): void {
    const w = this.stats(id);
    if (!w) return;
    const timer = (this.timers.get(id) ?? 0) - dt;
    this.timers.set(id, timer);
    if (timer > 0) return;
    const target = enemies.nearest(player.x, player.z, range);
    if (!target) {
      this.timers.set(id, 0);
      return;
    }
    const angle = this.fire(id, w, player, target);
    this.timers.set(id, w.interval * player.stats.cooldown);
    this.onShoot?.(id, player.x, player.z, angle);
  }

  /** Tire en direction de `target`. Renvoie l'angle du tir. */
  private fire(kind: ShotKind, w: WeaponLevel, player: Player, target: Enemy): number {
    const base = Math.atan2(target.z - player.z, target.x - player.x);
    const def = kind === 'rifle' ? RIFLE : SPEAR;
    const radius = kind === 'rifle' ? RIFLE.radius : w.area;
    for (let i = 0; i < w.count && this.shots.length < MAX_SHOTS; i++) {
      // Les projectiles supplémentaires partent en éventail autour de la cible.
      const a = base + (i - (w.count - 1) / 2) * def.spread;
      this.shots.push({
        kind,
        x: player.x,
        z: player.z,
        vx: Math.cos(a) * def.speed,
        vz: Math.sin(a) * def.speed,
        speed: def.speed,
        radius,
        damage: player.stats.damage * w.damage,
        life: def.life,
        pierce: w.pierce,
        hit: new Set(),
      });
    }
    return base;
  }

  private moveShots(dt: number, enemies: Enemies): void {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.life -= dt;

      let dead = s.life <= 0;
      if (!dead) {
        for (const e of enemies.list) {
          if (e.hp <= 0 || s.hit.has(e)) continue;
          const reach = e.radius + s.radius;
          if ((e.x - s.x) ** 2 + (e.z - s.z) ** 2 > reach * reach) continue;
          enemies.hit(e, s.damage, s.vx / s.speed, s.vz / s.speed);
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
  }

  private updateOrbs(time: number, player: Player, enemies: Enemies): void {
    const w = this.stats('orbs');
    const orbs = w ? Math.min(w.count, MAX_ORBS) : 0;
    for (let i = 0; i < orbs; i++) {
      const a = time * ORB_SPEED + (i * Math.PI * 2) / orbs;
      const ox = player.x + Math.cos(a) * w!.area;
      const oz = player.z + Math.sin(a) * w!.area;
      for (const e of enemies.list) {
        if (e.hp <= 0 || e.orbCooldown > 0) continue;
        const reach = e.radius + ORB_RADIUS;
        const dx = e.x - ox;
        const dz = e.z - oz;
        if (dx * dx + dz * dz > reach * reach) continue;
        const d = Math.hypot(e.x - player.x, e.z - player.z) || 1;
        enemies.hit(e, player.stats.damage * w!.damage, (e.x - player.x) / d, (e.z - player.z) / d);
        e.orbCooldown = w!.interval * player.stats.cooldown;
      }
      this.orbMesh.setMatrixAt(i, this.m.makeTranslation(ox, 0.9, oz));
      // La lueur bat doucement.
      this.haloMesh.setMatrixAt(i, this.m.compose(this.p.set(ox, 0.9, oz), this.q.identity(), this.s.setScalar(0.85 + 0.15 * Math.sin(time * 6 + i))));
    }
    this.orbMesh.count = this.haloMesh.count = orbs;
    this.orbMesh.instanceMatrix.needsUpdate = true;
    this.haloMesh.instanceMatrix.needsUpdate = true;
  }

  /** Aura : à chaque pulsation, blesse et repousse tous les ennemis proches. */
  private updateAura(dt: number, player: Player, enemies: Enemies): void {
    const w = this.stats('aura');
    this.auraDisc.visible = !!w;
    if (!w) {
      this.auraRing.visible = false;
      return;
    }
    this.auraDisc.position.x = this.auraRing.position.x = player.x;
    this.auraDisc.position.z = this.auraRing.position.z = player.z;
    this.auraDisc.scale.setScalar(w.area);

    const timer = (this.timers.get('aura') ?? 0) - dt;
    this.timers.set('aura', timer);
    if (timer <= 0) {
      let touched = false;
      for (const e of enemies.list) {
        const dx = e.x - player.x;
        const dz = e.z - player.z;
        const d = Math.hypot(dx, dz) || 0.0001;
        if (e.hp <= 0 || d > w.area + e.radius) continue;
        enemies.hit(e, player.stats.damage * w.damage, dx / d, dz / d);
        touched = true;
      }
      // Sans ennemi à portée, l'aura attend ; la pulsation suivante se déclenche dès qu'il en vient un.
      this.timers.set('aura', touched ? w.interval * player.stats.cooldown : 0);
      if (touched) {
        this.ringAge = 0;
        this.onPulse?.(player.x, player.z, w.area);
      }
    }

    this.ringAge = Math.min(1, this.ringAge + dt / RING_TIME);
    this.auraRing.visible = this.ringAge < 1;
    if (this.auraRing.visible) {
      this.auraRing.scale.setScalar(w.area * (0.5 + 0.5 * this.ringAge));
      (this.auraRing.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - this.ringAge);
    }
  }

  /** Mines : une pose régulière derrière le héros tant que des ennemis rôdent, puis explosion au contact. */
  private updateMines(dt: number, time: number, player: Player, enemies: Enemies): void {
    const w = this.stats('mines');
    if (w) {
      const timer = (this.timers.get('mines') ?? 0) - dt;
      this.timers.set('mines', timer);
      if (timer <= 0) {
        // On sème en marchant : rester sur place, ou piétiner, ne pose pas de nouvelles mines. Il faut avoir
        // parcouru assez de chemin depuis la dernière pose, et des ennemis doivent rôder.
        const last = this.lastMineDrop;
        const travelled = !last || Math.hypot(player.x - last.x, player.z - last.z) >= MINE_SPACING;
        if (player.moving && travelled && enemies.nearest(player.x, player.z, RANGE + 4)) {
          // Derrière le héros, dans le sens contraire à sa marche.
          const backX = player.x - Math.sin(player.group.rotation.y) * MINE_BEHIND;
          const backZ = player.z - Math.cos(player.group.rotation.y) * MINE_BEHIND;
          for (let i = 0; i < w.count && this.mines.length < MAX_MINES; i++) {
            this.mines.push({ x: backX + rand(-0.6, 0.6), z: backZ + rand(-0.6, 0.6), age: 0, damage: player.stats.damage * w.damage, area: w.area });
          }
          this.lastMineDrop = { x: player.x, z: player.z };
          this.timers.set('mines', w.interval * player.stats.cooldown);
        } else {
          // Prête à poser dès que les conditions sont réunies.
          this.timers.set('mines', 0);
        }
      }
    }

    for (let i = this.mines.length - 1; i >= 0; i--) {
      const mine = this.mines[i];
      mine.age += dt;
      let blast = mine.age >= MINE_LIFE;
      if (!blast && mine.age >= MINE_ARM_TIME) {
        for (const e of enemies.list) {
          if (e.hp > 0 && (e.x - mine.x) ** 2 + (e.z - mine.z) ** 2 < (MINE_TRIGGER + e.radius) ** 2) {
            blast = true;
            break;
          }
        }
      }
      if (!blast) continue;
      for (const e of enemies.list) {
        const dx = e.x - mine.x;
        const dz = e.z - mine.z;
        const d = Math.hypot(dx, dz) || 0.0001;
        if (e.hp > 0 && d < mine.area + e.radius) enemies.hit(e, mine.damage, dx / d, dz / d);
      }
      this.onBlast?.(mine.x, mine.z, mine.area);
      this.mines[i] = this.mines[this.mines.length - 1];
      this.mines.pop();
    }

    for (let i = 0; i < this.mines.length; i++) {
      const mine = this.mines[i];
      this.mineMesh.setMatrixAt(i, this.m.makeTranslation(mine.x, 0.28, mine.z));
      // Voyant : gris tant que la mine n'est pas armée, puis il clignote en rouge.
      const armed = mine.age >= MINE_ARM_TIME;
      this.mineMesh.setColorAt(i, armed ? (Math.sin(time * 12 + i) > 0 ? MINE_ARMED : MINE_BLINK) : MINE_IDLE);
    }
    this.mineMesh.count = this.mines.length;
    this.mineMesh.instanceMatrix.needsUpdate = true;
    if (this.mineMesh.instanceColor) this.mineMesh.instanceColor.needsUpdate = true;
  }

  /** Couleur d'une apparence à l'instant donné (l'arc-en-ciel change avec le temps), ou null pour la couleur d'origine. */
  private styleColor(spec: number | 'rainbow' | null, time: number): THREE.Color | null {
    if (spec === null) return null;
    return spec === 'rainbow' ? this.tint.setHSL((time * 0.6) % 1, 1, 0.6) : this.tint.setHex(spec);
  }

  private render(time: number): void {
    const projectile = this.styleColor(this.style.projectile, time);
    (this.shotMesh.material as THREE.MeshBasicMaterial).color.copy(projectile ?? BULLET_COLOR);
    (this.spearMesh.material as THREE.MeshBasicMaterial).color.copy(projectile ?? SPEAR_COLOR);
    const trailColor = this.styleColor(this.style.trail, time)?.clone() ?? null;

    let bullets = 0;
    let spears = 0;
    let trails = 0;
    for (const s of this.shots) {
      // Projectile étiré dans le sens du déplacement.
      this.p.set(s.x, 0.9, s.z);
      this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(s.vx, s.vz));
      // Traînée : un cône posé derrière le projectile.
      const length = s.kind === 'rifle' ? 2.4 : 3.6;
      const width = s.kind === 'rifle' ? 0.22 : s.radius * 1.6;
      const back = length / 2 / s.speed;
      this.v.set(s.x - s.vx * back, 0.9, s.z - s.vz * back);
      this.trailMesh.setMatrixAt(trails, this.m.compose(this.v, this.q, this.s.set(width, width, length)));
      this.trailMesh.setColorAt(trails++, trailColor ?? TRAIL_COLORS[s.kind]);
      if (s.kind === 'rifle') {
        this.s.set(1, 1, 2.2);
        this.shotMesh.setMatrixAt(bullets++, this.m.compose(this.p, this.q, this.s));
      } else {
        const width = s.radius / 0.5;
        this.s.set(width, width, 1);
        this.spearMesh.setMatrixAt(spears++, this.m.compose(this.p, this.q, this.s));
      }
    }
    this.shotMesh.count = bullets;
    this.spearMesh.count = spears;
    this.trailMesh.count = trails;
    this.trailMesh.instanceMatrix.needsUpdate = true;
    if (this.trailMesh.instanceColor) this.trailMesh.instanceColor.needsUpdate = true;
    this.shotMesh.instanceMatrix.needsUpdate = true;
    this.spearMesh.instanceMatrix.needsUpdate = true;
  }
}
