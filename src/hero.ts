import * as THREE from 'three';
import type { HeroAsset } from './assets';
import { toonMaterial } from './world';

export type HeroState = 'idle' | 'run' | 'dead';

/** Apparence du héros : un objet 3D attaché au joueur, animé selon son état. */
export interface HeroView {
  readonly object: THREE.Object3D;
  /** `speed` : vitesse de déplacement du joueur, pour caler le rythme de la course. */
  update(dt: number, state: HeroState, speed: number): void;
}

const FADE = 0.15;

/** Héros basé sur un modèle glTF animé par squelette. */
export function createModelHero(asset: HeroAsset): HeroView {
  const mixer = new THREE.AnimationMixer(asset.animated);
  const actions: Partial<Record<HeroState, THREE.AnimationAction>> = {};
  for (const state of ['idle', 'run', 'dead'] as const) {
    const clip = state === 'dead' ? asset.clips.death : asset.clips[state];
    if (clip) actions[state] = mixer.clipAction(clip);
  }
  if (actions.dead) {
    actions.dead.setLoop(THREE.LoopOnce, 1);
    actions.dead.clampWhenFinished = true;
  }

  let current: HeroState | null = null;

  return {
    object: asset.root,
    update(dt, state, speed) {
      if (state !== current) {
        const next = actions[state];
        const previous = current ? actions[current] : undefined;
        if (next && next !== previous) {
          next.reset().fadeIn(FADE).play();
          previous?.fadeOut(FADE);
        }
        current = state;
      }
      if (actions.run) actions.run.timeScale = speed / 6;
      mixer.update(dt);
    },
  };
}

/** Héros de secours fait de formes simples, utilisé si le modèle n'a pas pu être chargé. */
export function createFallbackHero(): HeroView {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.45, 6, 14), toonMaterial(0x3b82f6));
  body.position.y = 0.78;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 14), toonMaterial(0xffd7a8));
  head.position.y = 1.5;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.37, 0.55, 14), toonMaterial(0xff4d5e));
  hat.position.y = 1.98;
  group.add(body, head, hat);

  const feet: THREE.Mesh[] = [];
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x1b1b2f });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeMaterial);
    eye.position.set(side * 0.13, 1.54, 0.32);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), toonMaterial(0x2a2f55));
    foot.position.set(side * 0.18, 0.14, 0);
    feet.push(foot);
    group.add(eye, foot);
  }
  group.traverse((o) => {
    o.castShadow = true;
  });

  let walk = 0;
  return {
    object: group,
    update(dt, state) {
      const running = state === 'run';
      if (running) walk += dt * 13;
      const swing = running ? Math.sin(walk) : 0;
      feet[0].position.z = swing * 0.22;
      feet[1].position.z = -swing * 0.22;
      body.position.y = 0.78 + (running ? Math.abs(Math.cos(walk)) * 0.07 : 0);
      // Mort : le personnage bascule sur le dos.
      const target = state === 'dead' ? -Math.PI / 2 : 0;
      group.rotation.x += (target - group.rotation.x) * Math.min(1, dt * 10);
    },
  };
}
