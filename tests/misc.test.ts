import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { bakeClip, bakePose, fitGeometries } from '../src/bake';
import { Player } from '../src/player';
import { rand, random, resetRandom, seedRandom } from '../src/rng';
import { formatTime } from '../src/ui';
import { UPGRADES, rollUpgrades } from '../src/upgrades';

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
  it('ont des identifiants uniques', () => {
    expect(new Set(UPGRADES.map((u) => u.id)).size).toBe(UPGRADES.length);
  });

  it('propose des améliorations distinctes', () => {
    seedRandom(3);
    for (let i = 0; i < 100; i++) {
      const picks = rollUpgrades(new Map(), 3);
      expect(picks).toHaveLength(3);
      expect(new Set(picks).size).toBe(3);
    }
  });

  it('ne propose plus une amélioration arrivée au maximum', () => {
    const levels = new Map(UPGRADES.map((u) => [u.id, u.max]));
    expect(rollUpgrades(levels, 3)).toEqual([]);
    levels.set('damage', 0);
    expect(rollUpgrades(levels, 3).map((u) => u.id)).toEqual(['damage']);
  });

  it('modifie réellement le héros', () => {
    for (const upgrade of UPGRADES) {
      const player = new Player(new THREE.Scene());
      player.hp = 50;
      const before = JSON.stringify([player.stats, player.hp]);
      upgrade.apply(player);
      expect(JSON.stringify([player.stats, player.hp]), upgrade.id).not.toBe(before);
    }
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
