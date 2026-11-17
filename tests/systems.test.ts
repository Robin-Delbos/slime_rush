import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ENEMY_TYPES, enemyDamageScale } from '../src/enemies';
import { Pickups } from '../src/pickups';
import { Player, baseStats } from '../src/player';
import { resetRandom, seedRandom } from '../src/rng';
import { Effects } from '../src/effects';
import { Weapons } from '../src/weapons';
import { WEAPONS, weaponDef } from '../src/weaponData';
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

  it('frappe plus fort au fil de la partie', () => {
    const damageTaken = (time: number) => {
      const { enemies, player } = makeArena();
      placeEnemy(enemies, 0.3, 0);
      for (let i = 0; i < 100; i++) enemies.update(STEP, time, player);
      return player.stats.maxHp - player.hp;
    };
    expect(damageTaken(300)).toBeGreaterThan(damageTaken(0) * 2.5);
  });

  it('augmente ses dégâts sans cesse, et plus vite passé 3 minutes', () => {
    expect(enemyDamageScale(0)).toBe(1);
    let previous = 0;
    for (let t = 0; t <= 900; t += 30) {
      expect(enemyDamageScale(t)).toBeGreaterThan(previous);
      previous = enemyDamageScale(t);
    }
    const before = enemyDamageScale(180) - enemyDamageScale(120);
    const after = enemyDamageScale(300) - enemyDamageScale(240);
    expect(after).toBeGreaterThan(before * 2);
  });

  it('fait apparaître de plus en plus d’ennemis avec le temps', () => {
    const spawned = (time: number) => {
      const { enemies, player } = makeArena();
      for (let i = 0; i < 300; i++) enemies.update(STEP, time, player);
      return enemies.list.length;
    };
    expect(spawned(120)).toBeGreaterThan(spawned(0) * 2);
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
  /** Arène avec les armes données (la carabine par défaut), au niveau 1. */
  const setup = (...ids: string[]) => {
    const arena = makeArena();
    const weapons = new Weapons(arena.scene);
    for (const id of ids.length ? ids : ['rifle']) weapons.levelUp(id);
    return { ...arena, weapons };
  };
  /** Avance les armes sans faire bouger les ennemis. */
  const advance = (w: Weapons, a: ReturnType<typeof makeArena>, seconds: number) => {
    for (let t = 0; t < seconds; t += STEP) w.update(STEP, t, a.player, a.enemies);
  };

  describe('niveaux', () => {
    it('donne une arme au niveau 1 puis la fait monter jusqu’au maximum', () => {
      const w = setup().weapons;
      expect(w.owned).toEqual(['rifle']);
      const max = weaponDef('rifle')!.levels.length;
      for (let level = 2; level <= max; level++) expect(w.levelUp('rifle')).toBe(level);
      expect(w.levelUp('rifle')).toBe(0);
      expect(w.level('rifle')).toBe(max);
      expect(w.levelUp('bazooka')).toBe(0);
      expect(w.level('bazooka')).toBe(0);
    });

    it('oublie ses armes à la remise à zéro', () => {
      const w = setup('rifle', 'aura').weapons;
      w.clear();
      expect(w.owned).toEqual([]);
      expect(w.level('aura')).toBe(0);
    });

    it('n’attaque pas sans arme', () => {
      const s = setup();
      s.weapons.clear();
      const e = placeEnemy(s.enemies, 2, 0);
      advance(s.weapons, s, 1);
      expect(e.hp).toBe(e.type.hp);
    });
  });

  describe('Carabine', () => {
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

    it('tire plus vite quand le multiplicateur de cadence du héros baisse', () => {
      const shotsIn = (cooldown: number) => {
        const s = setup();
        s.player.stats.cooldown = cooldown;
        let shots = 0;
        s.weapons.onShoot = () => shots++;
        placeEnemy(s.enemies, 6, 0, enemyType('orc'));
        advance(s.weapons, s, 2);
        return shots;
      };
      expect(shotsIn(0.5)).toBeGreaterThan(shotsIn(1) * 1.6);
    });

    it('tire plusieurs projectiles au niveau 2', () => {
      const s = setup();
      s.weapons.levelUp('rifle');
      placeEnemy(s.enemies, 8, 0);
      s.weapons.update(STEP, 0, s.player, s.enemies);
      expect(s.weapons.shotCount).toBe(2);
    });

    it('s’arrête au premier ennemi, et traverse au niveau 5', () => {
      const blocked = setup();
      const front = placeEnemy(blocked.enemies, 4, 0);
      const back = placeEnemy(blocked.enemies, 6, 0);
      advance(blocked.weapons, blocked, 0.5);
      expect(front.hp).toBeLessThanOrEqual(0);
      expect(back.hp).toBe(back.type.hp);

      const piercing = setup();
      for (let i = 0; i < 4; i++) piercing.weapons.levelUp('rifle');
      const first = placeEnemy(piercing.enemies, 4, 0);
      const second = placeEnemy(piercing.enemies, 6, 0);
      advance(piercing.weapons, piercing, 0.5);
      expect(first.hp).toBeLessThanOrEqual(0);
      expect(second.hp).toBeLessThanOrEqual(0);
    });

    it('inflige les dégâts du héros multipliés par ceux du niveau', () => {
      const s = setup();
      s.player.stats.damage = 3;
      const e = placeEnemy(s.enemies, 6, 0, enemyType('orc'));
      advance(s.weapons, s, 0.5);
      expect(e.hp).toBeCloseTo(e.type.hp - 3);
    });
  });

  describe('Gardiens', () => {
    it('blessent au contact, pas plus d’une fois par délai', () => {
      const s = setup('orbs');
      // À t=0 un orbe se trouve en (2.4, 0).
      const orc = placeEnemy(s.enemies, 2.4, 0, enemyType('orc'));
      s.weapons.update(STEP, 0, s.player, s.enemies);
      const afterFirst = orc.hp;
      expect(afterFirst).toBeLessThan(orc.type.hp);
      s.weapons.update(STEP, 0, s.player, s.enemies);
      expect(orc.hp).toBe(afterFirst);
    });

    it('ne blessent pas ce qui est hors de l’orbite', () => {
      const s = setup('orbs');
      const far = placeEnemy(s.enemies, 6, 0, enemyType('orc'));
      advance(s.weapons, s, 1);
      expect(far.hp).toBe(far.type.hp);
    });

    it('gagnent des orbes et une orbite plus large avec les niveaux', () => {
      const levels = weaponDef('orbs')!.levels;
      expect(levels[1].count).toBeGreaterThan(levels[0].count);
      expect(levels[3].area).toBeGreaterThan(levels[0].area);
    });
  });

  describe('Aura ardente', () => {
    it('blesse et repousse les ennemis proches, pas les lointains', () => {
      const s = setup('aura');
      const near = placeEnemy(s.enemies, 2, 0, enemyType('orc'));
      const far = placeEnemy(s.enemies, 8, 0, enemyType('orc'));
      s.weapons.update(STEP, 0, s.player, s.enemies);
      expect(near.hp).toBeLessThan(near.type.hp);
      expect(near.x).toBeGreaterThan(2);
      expect(far.hp).toBe(far.type.hp);
    });

    it('pulse à intervalle régulier et attend qu’un ennemi arrive', () => {
      const s = setup('aura');
      const orc = placeEnemy(s.enemies, 2, 0, enemyType('orc'));
      s.weapons.update(STEP, 0, s.player, s.enemies);
      const afterFirst = orc.hp;
      orc.x = 2;
      advance(s.weapons, s, 0.5);
      expect(orc.hp).toBe(afterFirst);
      advance(s.weapons, s, 0.6);
      expect(orc.hp).toBeLessThan(afterFirst);

      // Sans ennemi à portée, la pulsation reste prête et part dès qu'il en arrive un.
      const idle = setup('aura');
      advance(idle.weapons, idle, 2);
      const late = placeEnemy(idle.enemies, 2, 0, enemyType('orc'));
      idle.weapons.update(STEP, 0, idle.player, idle.enemies);
      expect(late.hp).toBeLessThan(late.type.hp);
    });

    it('s’élargit avec les niveaux', () => {
      const s = setup('aura');
      const e = placeEnemy(s.enemies, 4.2, 0, enemyType('orc'));
      s.weapons.update(STEP, 0, s.player, s.enemies);
      expect(e.hp).toBe(e.type.hp);
      s.weapons.levelUp('aura');
      s.weapons.update(STEP, 0, s.player, s.enemies);
      expect(e.hp).toBeLessThan(e.type.hp);
    });
  });

  describe('Lance', () => {
    it('transperce tous les ennemis alignés', () => {
      const s = setup('spear');
      const line = [4, 7, 10].map((x) => placeEnemy(s.enemies, x, 0));
      advance(s.weapons, s, 0.6);
      for (const e of line) expect(e.hp, `ennemi en x=${e.x}`).toBeLessThanOrEqual(0);
    });

    it('part de plus loin que la carabine et recharge lentement', () => {
      const s = setup('spear');
      let throws = 0;
      s.weapons.onShoot = () => throws++;
      placeEnemy(s.enemies, 13, 0, enemyType('orc'));
      advance(s.weapons, s, 1.4);
      expect(throws).toBe(2);
    });

    it('lance plusieurs lances à partir du niveau 4', () => {
      const s = setup('spear');
      for (let i = 0; i < 3; i++) s.weapons.levelUp('spear');
      placeEnemy(s.enemies, 8, 0, enemyType('orc'));
      s.weapons.update(STEP, 0, s.player, s.enemies);
      expect(s.weapons.shotCount).toBe(2);
    });
  });

  describe('Événements', () => {
    it('annonce chaque tir avec l’arme, la position du héros et la direction', () => {
      const s = setup('spear');
      s.player.group.position.set(2, 0, 1);
      const shots: { weapon: string; x: number; z: number; angle: number }[] = [];
      s.weapons.onShoot = (weapon, x, z, angle) => shots.push({ weapon, x, z, angle });
      placeEnemy(s.enemies, 2, 11, enemyType('orc'));
      s.weapons.update(STEP, 0, s.player, s.enemies);
      expect(shots).toHaveLength(1);
      expect(shots[0].weapon).toBe('spear');
      expect(shots[0].x).toBe(2);
      expect(shots[0].z).toBe(1);
      // Cible droit devant en +Z : angle atan2(dz, dx) = π/2.
      expect(shots[0].angle).toBeCloseTo(Math.PI / 2);
    });

    it('annonce chaque pulsation de l’aura, seulement si un ennemi est touché', () => {
      const s = setup('aura');
      const pulses: number[] = [];
      s.weapons.onPulse = (_x, _z, radius) => pulses.push(radius);
      advance(s.weapons, s, 1);
      expect(pulses).toEqual([]);
      placeEnemy(s.enemies, 2, 0, enemyType('orc'));
      s.weapons.update(STEP, 0, s.player, s.enemies);
      expect(pulses).toEqual([weaponDef('aura')!.levels[0].area]);
    });
  });

  describe('Cumul', () => {
    it('fait agir plusieurs armes en même temps', () => {
      const s = setup('rifle', 'aura');
      const orc = placeEnemy(s.enemies, 2, 0, enemyType('orc'));
      advance(s.weapons, s, 0.4);
      // Une pulsation de l'aura (7) et un tir de carabine (10) : plus que chaque arme seule.
      expect(orc.hp).toBeLessThanOrEqual(orc.type.hp - 16);
    });
  });
});

describe('Données des armes', () => {
  it('ont des identifiants uniques et des valeurs valides', () => {
    expect(new Set(WEAPONS.map((w) => w.id)).size).toBe(WEAPONS.length);
    for (const w of WEAPONS) {
      expect(w.levels.length, w.id).toBeGreaterThanOrEqual(2);
      for (const l of w.levels) {
        expect(l.desc.length, w.id).toBeGreaterThan(0);
        expect(l.damage, w.id).toBeGreaterThan(0);
        expect(l.interval, w.id).toBeGreaterThan(0);
        expect(l.count, w.id).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('s’améliorent à chaque niveau, sans jamais régresser', () => {
    for (const w of WEAPONS) {
      for (let i = 1; i < w.levels.length; i++) {
        const before = w.levels[i - 1];
        const after = w.levels[i];
        const label = `${w.id} niveau ${i + 1}`;
        expect(after.damage, label).toBeGreaterThanOrEqual(before.damage);
        expect(after.interval, label).toBeLessThanOrEqual(before.interval);
        expect(after.count, label).toBeGreaterThanOrEqual(before.count);
        expect(after.pierce, label).toBeGreaterThanOrEqual(before.pierce);
        expect(after.area, label).toBeGreaterThanOrEqual(before.area);
        const better =
          after.damage > before.damage ||
          after.interval < before.interval ||
          after.count > before.count ||
          after.pierce > before.pierce ||
          after.area > before.area;
        expect(better, `${label} n’apporte rien`).toBe(true);
      }
    }
  });

  it('ont chacune une icône : texte, ou dessin SVG complet', () => {
    for (const w of WEAPONS) {
      expect(w.icon.length, w.id).toBeGreaterThan(0);
      if (w.icon.startsWith('<svg')) {
        expect(w.icon, w.id).toContain('viewBox');
        expect(w.icon.trim().endsWith('</svg>'), w.id).toBe(true);
      }
    }
  });

  it('dessine l’icône de la carabine plutôt que d’utiliser un emoji', () => {
    expect(weaponDef('rifle')!.icon.startsWith('<svg')).toBe(true);
  });

  it('proposent une arme gratuite et plusieurs armes à débloquer', () => {
    expect(WEAPONS.some((w) => w.cost === 0)).toBe(true);
    expect(WEAPONS.filter((w) => w.cost > 0).length).toBeGreaterThanOrEqual(2);
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

describe('Effets visuels', () => {
  const setupEffects = () => {
    const scene = new THREE.Scene();
    const layer = { replaceChildren() {}, append() {} } as unknown as HTMLElement;
    const effects = new Effects(scene, new THREE.PerspectiveCamera(), layer);
    return { scene, effects };
  };
  const color = new THREE.Color(1, 0.5, 0);
  const instanceCount = (scene: THREE.Scene) => (scene.children.find((c) => (c as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh).count;

  it('fait gonfler des nuages puis les retire', () => {
    const { scene, effects } = setupEffects();
    effects.puff(0, 0.5, 0, color, 1, 4);
    effects.update(0.01);
    expect(instanceCount(scene)).toBe(4);
    for (let i = 0; i < 30; i++) effects.update(0.05);
    expect(instanceCount(scene)).toBe(0);
  });

  it('lance une couronne d’étincelles autour d’un cercle', () => {
    const { scene, effects } = setupEffects();
    effects.ring(0, 0, 3, color, 12);
    effects.update(0.01);
    expect(instanceCount(scene)).toBe(12);
  });

  it('ne dépasse pas le nombre maximum de particules', () => {
    const { scene, effects } = setupEffects();
    for (let i = 0; i < 100; i++) {
      effects.puff(0, 0, 0, color, 1, 10);
      effects.ring(0, 0, 2, color, 10);
    }
    effects.update(0.01);
    expect(instanceCount(scene)).toBeLessThanOrEqual(400);
  });

  it('étend une onde de choc faite d’un disque et d’un anneau, puis la retire', () => {
    const { scene, effects } = setupEffects();
    const before = scene.children.length;
    effects.shockwave(0, 0, 5, color);
    expect(scene.children.length).toBe(before + 2);
    for (let i = 0; i < 20; i++) effects.update(0.05);
    expect(scene.children.length).toBe(before);
  });

  it('vide tout à la remise à zéro', () => {
    const { scene, effects } = setupEffects();
    const before = scene.children.length;
    effects.shockwave(0, 0, 5, color);
    effects.puff(0, 0, 0, color, 1, 5);
    effects.clear();
    expect(scene.children.length).toBe(before);
    effects.update(0.01);
    expect(instanceCount(scene)).toBe(0);
  });
});
