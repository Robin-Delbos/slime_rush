import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { countUp, easeOutCubic } from '../src/anim';
import { ATMOSPHERES, DEFAULT_ATMOSPHERE, atmosphereFor } from '../src/atmosphere';
import { bakeClip, bakePose, fitGeometries } from '../src/bake';
import { DIFFICULTIES } from '../src/meta';
import { Player } from '../src/player';
import { rand, random, resetRandom, seedRandom } from '../src/rng';
import { formatTime } from '../src/ui';
import {
  PASSIVES,
  WEAPON_PREFIX,
  rollUpgrades,
  weaponUpgrade,
} from '../src/upgrades';
import { WEAPONS, weaponDef } from '../src/weaponData';
import { makeRun } from './helpers';

afterEach(() => resetRandom());

describe('rng', () => {
  it('produit la même suite pour la même graine', () => {
    seedRandom(99);
    const a = [random(), random(), random()];
    seedRandom(99);
    expect([random(), random(), random()]).toEqual(a);
    seedRandom(100);
    expect(random()).not.toBe(a[0]);
  });

  it('reste dans les bornes', () => {
    seedRandom(5);
    for (let i = 0; i < 1000; i++) {
      const value = rand(2, 5);
      expect(value).toBeGreaterThanOrEqual(2);
      expect(value).toBeLessThan(5);
    }
  });
});

describe('formatTime', () => {
  it('affiche minutes et secondes sur deux chiffres', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(9.9)).toBe('00:09');
    expect(formatTime(75)).toBe('01:15');
    expect(formatTime(3599)).toBe('59:59');
  });
});

describe('Améliorations en partie', () => {
  const weaponIds = WEAPONS.map((w) => WEAPON_PREFIX + w.id);
  const allMax = () =>
    new Map<string, number>([
      ...PASSIVES.map((u): [string, number] => [u.id, u.max]),
      ...WEAPONS.map((w): [string, number] => [WEAPON_PREFIX + w.id, w.levels.length]),
    ]);

  it('ont des identifiants uniques', () => {
    const ids = [...PASSIVES.map((u) => u.id), ...weaponIds];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('propose des améliorations distinctes', () => {
    seedRandom(3);
    for (let i = 0; i < 100; i++) {
      const picks = rollUpgrades(new Map(), 3);
      expect(picks).toHaveLength(3);
      expect(new Set(picks.map((p) => p.id)).size).toBe(3);
    }
  });

  it('ne propose plus ce qui est arrivé au maximum', () => {
    const levels = allMax();
    expect(rollUpgrades(levels, 3)).toEqual([]);
    levels.set('power', 0);
    expect(rollUpgrades(levels, 3).map((u) => u.id)).toEqual(['power']);
    levels.set('weapon:rifle', 5);
    expect(rollUpgrades(levels, 3).map((u) => u.id).sort()).toEqual(['power', 'weapon:rifle']);
  });

  it('propose le niveau suivant d’une arme possédée, avec ce qu’il apporte', () => {
    const levels = allMax();
    levels.set('weapon:rifle', 1);
    const [card] = rollUpgrades(levels, 3);
    expect(card.id).toBe('weapon:rifle');
    expect(card.desc).toBe(weaponDef('rifle')!.levels[1].desc);
    expect(card.max).toBe(weaponDef('rifle')!.levels.length);
  });

  it('ne propose que les niveaux de l’arme portée, jamais une autre arme', () => {
    seedRandom(11);
    for (const weapon of WEAPONS) {
      const levels = new Map([[WEAPON_PREFIX + weapon.id, 1]]);
      const seen = new Set<string>();
      for (let i = 0; i < 300; i++) {
        for (const pick of rollUpgrades(levels, 3)) {
          if (pick.id.startsWith(WEAPON_PREFIX)) seen.add(pick.id);
        }
      }
      expect([...seen], weapon.id).toEqual([WEAPON_PREFIX + weapon.id]);
    }
  });

  it('ne propose aucune arme quand le héros n’en porte pas', () => {
    seedRandom(5);
    for (let i = 0; i < 200; i++) {
      for (const pick of rollUpgrades(new Map(), 3)) expect(pick.id.startsWith(WEAPON_PREFIX)).toBe(false);
    }
  });

  it('modifie réellement le héros ou ses armes', () => {
    for (const upgrade of PASSIVES) {
      const run = makeRun();
      run.player.hp = 50;
      const before = JSON.stringify([run.player.stats, run.player.hp]);
      upgrade.apply(run);
      expect(JSON.stringify([run.player.stats, run.player.hp]), upgrade.id).not.toBe(before);
    }
    const run = makeRun();
    expect(run.weapons.level('aura')).toBe(0);
    weaponUpgrade(weaponDef('aura')!, 0).apply(run);
    expect(run.weapons.level('aura')).toBe(1);
    weaponUpgrade(weaponDef('aura')!, 1).apply(run);
    expect(run.weapons.level('aura')).toBe(2);
  });
});

describe('Ambiance du ciel et de la lumière', () => {
  it('existe pour chaque difficulté', () => {
    for (const d of DIFFICULTIES) expect(ATMOSPHERES[d.id], d.id).toBeDefined();
    expect(ATMOSPHERES[DEFAULT_ATMOSPHERE]).toBeDefined();
  });

  it('retombe sur l’ambiance normale pour une difficulté inconnue', () => {
    expect(atmosphereFor('inconnue')).toBe(ATMOSPHERES.normal);
    expect(atmosphereFor('hard')).toBe(ATMOSPHERES.hard);
  });

  it('change vraiment d’une difficulté à l’autre', () => {
    const skies = DIFFICULTIES.map((d) => ATMOSPHERES[d.id].skyBottom);
    expect(new Set(skies).size).toBe(DIFFICULTIES.length);
    const suns = DIFFICULTIES.map((d) => ATMOSPHERES[d.id].sun);
    expect(new Set(suns).size).toBe(DIFFICULTIES.length);
  });

  it('garde des couleurs valides et un éclairage suffisant pour lire le jeu', () => {
    for (const [id, a] of Object.entries(ATMOSPHERES)) {
      for (const color of [a.skyTop, a.skyBottom, a.fog, a.sun, a.hemiSky, a.hemiGround]) {
        expect(Number.isInteger(color) && color >= 0 && color <= 0xffffff, id).toBe(true);
      }
      expect(a.sunIntensity, id).toBeGreaterThanOrEqual(1.5);
      expect(a.hemiIntensity, id).toBeGreaterThanOrEqual(1);
    }
  });

  it('s’assombrit à mesure que la difficulté monte', () => {
    const brightness = (c: number) => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
    const tops = DIFFICULTIES.map((d) => brightness(ATMOSPHERES[d.id].skyTop));
    expect(tops[tops.length - 1]).toBeLessThan(tops[0]);
    const suns = DIFFICULTIES.map((d) => ATMOSPHERES[d.id].sunIntensity);
    expect(suns[suns.length - 1]).toBeLessThan(suns[1]);
  });
});

describe('Animations de compteur', () => {
  it('easeOutCubic reste entre 0 et 1, monte, et borne ses entrées', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(-3)).toBe(0);
    expect(easeOutCubic(7)).toBe(1);
    let previous = -1;
    for (let t = 0; t <= 1; t += 0.05) {
      expect(easeOutCubic(t)).toBeGreaterThanOrEqual(previous);
      previous = easeOutCubic(t);
    }
  });

  it('countUp part du début, finit exactement à la valeur visée et ne recule jamais', () => {
    expect(countUp(0, 137, 0)).toBe(0);
    expect(countUp(0, 137, 1)).toBe(137);
    expect(countUp(0, 137, 2)).toBe(137);
    let previous = -1;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const value = countUp(0, 137, t);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    expect(countUp(10, 10, 0.5)).toBe(10);
  });
});

describe('Cuisson des modèles', () => {
  it('fige un maillage dans le repère du monde avec sa couleur', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
    mesh.position.set(10, 0, 0);
    mesh.scale.setScalar(2);
    root.add(mesh);

    const baked = bakePose(root);
    baked.computeBoundingBox();
    expect(baked.boundingBox!.min.x).toBeCloseTo(9);
    expect(baked.boundingBox!.max.x).toBeCloseTo(11);
    expect(baked.getAttribute('position').count).toBe(mesh.geometry.getAttribute('position').count);
    const color = baked.getAttribute('color');
    expect([color.getX(0), color.getY(0), color.getZ(0)]).toEqual([1, 0, 0]);
  });

  it('suit le squelette et produit une image par instant du clip', () => {
    // Un triangle entièrement attaché à un os que l'animation soulève de 0 à 4.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    const bone = new THREE.Bone();
    bone.name = 'os';
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
    const root = new THREE.Group();
    root.add(bone, mesh);
    root.updateWorldMatrix(true, true);
    mesh.bind(new THREE.Skeleton([bone]));

    const clip = new THREE.AnimationClip('monte', 1, [
      new THREE.VectorKeyframeTrack('os.position', [0, 1], [0, 0, 0, 0, 4, 0]),
    ]);
    const frames = bakeClip(root, clip, 4);
    expect(frames).toHaveLength(4);
    expect(frames.map((f) => f.getAttribute('position').getY(0))).toEqual([0, 1, 2, 3]);
  });

  it('met à l’échelle, centre et pose le modèle au sol', () => {
    const frames = [new THREE.BoxGeometry(2, 4, 6).translate(5, 9, -3), new THREE.BoxGeometry(2, 4, 6).translate(5, 9, -3)];
    fitGeometries(frames, { size: 1, axis: 'y', hover: 0.5 });
    for (const frame of frames) {
      frame.computeBoundingBox();
      const box = frame.boundingBox!;
      expect(box.max.y - box.min.y).toBeCloseTo(1);
      expect(box.min.y).toBeCloseTo(0.5);
      expect(box.min.x + box.max.x).toBeCloseTo(0);
      expect(box.min.z + box.max.z).toBeCloseTo(0);
    }
  });

  it('peut cadrer sur la largeur (créatures volantes)', () => {
    const frames = [new THREE.BoxGeometry(8, 2, 2)];
    fitGeometries(frames, { size: 2, axis: 'x' });
    frames[0].computeBoundingBox();
    expect(frames[0].boundingBox!.max.x - frames[0].boundingBox!.min.x).toBeCloseTo(2);
  });
});
