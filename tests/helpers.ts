import * as THREE from 'three';
import { ENEMY_TYPES, Enemies, placeholderVisuals, type Enemy, type EnemyType } from '../src/enemies';
import { Player } from '../src/player';
import { Run, type RunEvents } from '../src/run';

export const STILL = { x: 0, y: 0 };

export function enemyType(id: string): EnemyType {
  const type = ENEMY_TYPES.find((t) => t.id === id);
  if (!type) throw new Error(`Type d'ennemi inconnu : ${id}`);
  return type;
}

export function makeRun(events: RunEvents = {}): Run {
  const run = new Run(new THREE.Scene(), placeholderVisuals(), events);
  run.reset();
  return run;
}

export function makeArena(): { scene: THREE.Scene; player: Player; enemies: Enemies } {
  const scene = new THREE.Scene();
  return { scene, player: new Player(scene), enemies: new Enemies(scene, placeholderVisuals()) };
}

/** Place un ennemi à une position précise (par défaut un slime). */
export function placeEnemy(enemies: Enemies, x: number, z: number, type = enemyType('slime')): Enemy {
  const enemy = enemies.spawn(0, 0, 0, type);
  enemy.x = x;
  enemy.z = z;
  return enemy;
}

/**
 * Fait tourner une partie pendant `seconds` avec un joueur automatique qui marche en cercle
 * et prend toujours la première amélioration proposée.
 */
export function simulate(run: Run, seconds: number, options: { move?: boolean; dt?: number; onStep?: () => void } = {}): void {
  const dt = options.dt ?? 1 / 30;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps && !run.over; i++) {
    if (run.pendingChoices) run.choose(run.pendingChoices[0]);
    const angle = run.time * 0.8;
    run.update(dt, options.move === false ? STILL : { x: Math.cos(angle), y: Math.sin(angle) });
    options.onStep?.();
  }
}
