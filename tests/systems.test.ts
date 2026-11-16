import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ENEMY_TYPES } from '../src/enemies';
import { Pickups } from '../src/pickups';
import { Player, baseStats } from '../src/player';
import { resetRandom, seedRandom } from '../src/rng';
import { Weapons } from '../src/weapons';
import { ARENA } from '../src/world';
import { STILL, enemyType, makeArena, placeEnemy } from './helpers';

beforeEach(() => seedRandom(7));
afterEach(() => resetRandom());

const STEP = 0.01;

describe('Player', () => {
  it('se déplace : haut de l’écran = -Z, droite = +X', () => {
    const player = new Player(new THREE.Scene());
    player.update(1, { x: 0, y: 1 });
    expect(player.z).toBeCloseTo(-player.stats.speed);
    player.update(1, { x: 1, y: 0 });
    expect(player.x).toBeCloseTo(player.stats.speed);
    expect(player.moving).toBe(true);
    player.update(1, STILL);
    expect(player.moving).toBe(false);
  });

  it('reste dans l’arène', () => {
    const player = new Player(new THREE.Scene());
    for (let i = 0; i < 100; i++) player.update(0.5, { x: 1, y: 1 });
    expect(player.x).toBe(ARENA);
    expect(player.z).toBe(-ARENA);
  });

  it('ne dépasse ni 0 ni le maximum de PV', () => {
    const player = new Player(new THREE.Scene());
    player.takeDamage(500);
    expect(player.hp).toBe(0);
    expect(player.hurt).toBe(true);
    player.heal(5000);
    expect(player.hp).toBe(player.stats.maxHp);
  });

  it('régénère ses PV avec la statistique regen', () => {
    const player = new Player(new THREE.Scene());
    player.reset({ ...baseStats(), regen: 2 });
    player.takeDamage(10);
    player.update(1, STILL);
    expect(player.hp).toBeCloseTo(92);
  });
});

describe('Enemies', () => {
  it('ne propose que les types débloqués à l’instant donné', () => {
    const { enemies } = makeArena();
    for (let i = 0; i < 50; i++) expect(enemies.spawn(0, 0, 0).type.id).toBe('slime');
    const late = new Set<string>();
    for (let i = 0; i < 400; i++) late.add(enemies.spawn(600, 0, 0).type.id);
    expect([...late].sort()).toEqual(ENEMY_TYPES.map((t) => t.id).sort());
  });

  it('fait apparaître les ennemis hors de l’écran et plus résistants avec le temps', () => {
    const { enemies } = makeArena();
    const early = enemies.spawn(0, 5, -3, enemyType('slime'));
    expect(Math.hypot(early.x - 5, early.z + 3)).toBeCloseTo(26);
    const late = enemies.spawn(180, 0, 0, enemyType('slime'));
    expect(late.hp).toBeCloseTo(early.hp * 3);
  });

  it('avance vers le joueur', () => {
    const { enemies, player } = makeArena();
    const e = placeEnemy(enemies, 10, 0);
    enemies.update(STEP, 0, player);
    expect(e.x).toBeLessThan(10);
    expect(e.z).toBeCloseTo(0);
  });

  it('blesse le joueur au contact sans le traverser', () => {
    const { enemies, player } = makeArena();
    const e = placeEnemy(enemies, 0.3, 0);
    for (let i = 0; i < 100; i++) enemies.update(STEP, 0, player);
    expect(player.hp).toBeCloseTo(player.stats.maxHp - e.type.damage, 0);
    expect(Math.hypot(e.x, e.z)).toBeCloseTo(e.radius + player.radius, 1);
  });

  it('sépare les ennemis qui se chevauchent', () => {
    const { enemies, player } = makeArena();
    const a = placeEnemy(enemies, 15, 0);
    const b = placeEnemy(enemies, 15.2, 0.1);
    for (let i = 0; i < 20; i++) enemies.update(STEP, 0, player);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(a.radius + b.radius - 0.05);
  });

  it('trouve l’ennemi vivant le plus proche dans la portée', () => {
    const { enemies } = makeArena();
    const near = placeEnemy(enemies, 3, 0);
    const far = placeEnemy(enemies, 8, 0);
    expect(enemies.nearest(0, 0, 10)).toBe(near);
    near.hp = 0;
    expect(enemies.nearest(0, 0, 10)).toBe(far);
    expect(enemies.nearest(0, 0, 5)).toBeNull();
  });

  it('applique dégâts et recul, puis retire les morts', () => {
    const { enemies } = makeArena();
    const hits: number[] = [];
    enemies.onHit = (_e, damage) => hits.push(damage);
    const e = placeEnemy(enemies, 5, 0);
    enemies.hit(e, 3, 1, 0);
    expect(e.hp).toBe(5);
    expect(e.x).toBeGreaterThan(5);
    expect(hits).toEqual([3]);

    enemies.hit(e, 100, 1, 0);
    const dead: unknown[] = [];
    enemies.sweepDead((d) => dead.push(d));
    expect(dead).toEqual([e]);
    expect(enemies.list).toHaveLength(0);
  });
});

describe('Weapons', () => {
  const setup = () => {
    const arena = makeArena();
    return { ...arena, weapons: new Weapons(arena.scene) };
  };
  /** Avance l'arme sans faire bouger les ennemis. */
  const advance = (w: Weapons, a: ReturnType<typeof makeArena>, seconds: number) => {
    for (let t = 0; t < seconds; t += STEP) w.update(STEP, t, a.player, a.enemies);
  };

  it('tire sur l’ennemi à portée et le blesse', () => {
    const s = setup();
    let shots = 0;
    s.weapons.onShoot = () => shots++;
    const e = placeEnemy(s.enemies, 6, 0);
    advance(s.weapons, s, 0.5);
    expect(shots).toBe(1);
    expect(e.hp).toBeLessThanOrEqual(0);
  });

  it('ne tire pas quand aucun ennemi n’est à portée', () => {
    const s = setup();
    placeEnemy(s.enemies, 20, 0);
    advance(s.weapons, s, 0.5);
    expect(s.weapons.shotCount).toBe(0);
  });

  it('respecte la cadence de tir', () => {
    const s = setup();
    let shots = 0;
    s.weapons.onShoot = () => shots++;
    placeEnemy(s.enemies, 6, 0, enemyType('orc'));
    advance(s.weapons, s, 0.55 * 4 + 0.1);
    expect(shots).toBe(5);
  });

  it('tire plusieurs projectiles avec l’amélioration tir multiple', () => {
    const s = setup();
    s.player.stats.projectiles = 3;
    placeEnemy(s.enemies, 8, 0);
    s.weapons.update(STEP, 0, s.player, s.enemies);
    expect(s.weapons.shotCount).toBe(3);
  });

  it('s’arrête au premier ennemi sans perforation, traverse avec', () => {
    const blocked = setup();
    const front = placeEnemy(blocked.enemies, 4, 0);
    const back = placeEnemy(blocked.enemies, 6, 0);
    advance(blocked.weapons, blocked, 0.5);
    expect(front.hp).toBeLessThanOrEqual(0);
    expect(back.hp).toBeGreaterThan(0);

    const piercing = setup();
    piercing.player.stats.pierce = 1;
    const first = placeEnemy(piercing.enemies, 4, 0);
    const second = placeEnemy(piercing.enemies, 6, 0);
    advance(piercing.weapons, piercing, 0.5);
    expect(first.hp).toBeLessThanOrEqual(0);
    expect(second.hp).toBeLessThanOrEqual(0);
  });

  it('blesse avec les orbes, pas plus d’une fois par délai', () => {
    const s = setup();
    s.player.stats.orbs = 1;
    // À t=0 l'orbe se trouve en (2.4, 0) ; l'orc y est placé, hors de portée de tir immédiat.
    const orc = placeEnemy(s.enemies, 2.4, 0, enemyType('orc'));
    s.player.stats.fireInterval = 999;
    s.weapons.update(STEP, 0, s.player, s.enemies);
    const afterShotAndOrb = orc.hp;
    expect(afterShotAndOrb).toBeLessThan(orc.type.hp);
    s.weapons.update(STEP, 0, s.player, s.enemies);
    expect(orc.hp).toBe(afterShotAndOrb);
  });
});

describe('Pickups', () => {
  const setup = () => {
    const scene = new THREE.Scene();
    return { player: new Player(scene), pickups: new Pickups(scene) };
  };

  it('laisse au sol ce qui est hors de portée de l’aimant', () => {
    const { player, pickups } = setup();
    pickups.spawn('xp', 10, 0, 1);
    for (let t = 0; t < 2; t += STEP) expect(pickups.update(STEP, t, player)).toEqual({ xp: 0, gold: 0 });
    expect(pickups.count).toBe(1);
  });

  it('attire puis ramasse gemmes et pièces à portée', () => {
    const { player, pickups } = setup();
    const picked: string[] = [];
    pickups.onPickup = (kind, value) => picked.push(`${kind}:${value}`);
    pickups.spawn('xp', 2, 0, 3);
    pickups.spawn('gold', 0, 1.5, 5);
    const total = { xp: 0, gold: 0 };
    for (let t = 0; t < 1; t += STEP) {
      const got = pickups.update(STEP, t, player);
      total.xp += got.xp;
      total.gold += got.gold;
    }
    expect(total).toEqual({ xp: 3, gold: 5 });
    expect(picked.sort()).toEqual(['gold:5', 'xp:3']);
    expect(pickups.count).toBe(0);
  });

  it('continue de suivre le joueur une fois aimanté', () => {
    const { player, pickups } = setup();
    pickups.spawn('xp', 2.5, 0, 1);
    pickups.update(STEP, 0, player);
    player.group.position.set(-6, 0, 0);
    let xp = 0;
    for (let t = 0; t < 2; t += STEP) xp += pickups.update(STEP, t, player).xp;
    expect(xp).toBe(1);
  });
});
