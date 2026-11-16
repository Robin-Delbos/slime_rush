import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { bakeClip, bakePose, fitGeometries, fitMatrix, type FitOptions } from './bake';
import { ENEMY_TYPES, placeholderVisual, type EnemyVisuals } from './enemies';
import { CHARACTERS } from './meta';
import { toonMaterial } from './world';

/** Modèle de héros prêt à l'emploi : mis à l'échelle, posé au sol, matériaux cartoon. */
export interface HeroAsset {
  root: THREE.Group;
  /** Objet animé par les clips (à passer à l'AnimationMixer). */
  animated: THREE.Object3D;
  clips: { idle?: THREE.AnimationClip; run?: THREE.AnimationClip; death?: THREE.AnimationClip };
}

export interface Assets {
  enemies: EnemyVisuals;
  heroes: Record<string, HeroAsset>;
}

const HERO_HEIGHT = 1.9;
const ENEMY_FRAMES = 12;

/** Fichier, clip de déplacement et cadrage de chaque ennemi. */
const ENEMY_MODELS: Record<string, { file: string; clip: string; fit: Omit<FitOptions, 'size'> }> = {
  slime: { file: 'slime.glb', clip: 'Walk', fit: { axis: 'y' } },
  bat: { file: 'bat.glb', clip: 'Flying', fit: { axis: 'x', hover: 0.5 } },
  orc: { file: 'orc.glb', clip: 'Walk', fit: { axis: 'y' } },
  skull: { file: 'skull.glb', clip: 'Walk', fit: { axis: 'y' } },
};

/** Nom court d'un clip : "CharacterArmature|Robot_Idle" -> "Idle". */
function shortName(clip: THREE.AnimationClip): string {
  return (clip.name.split('|').pop() ?? '').replace(/^(Robot|Bat|Spider)_/, '');
}

function findClip(clips: THREE.AnimationClip[], ...names: string[]): THREE.AnimationClip | undefined {
  return clips.find((c) => names.includes(shortName(c)));
}

function modelUrl(file: string): string {
  return `${import.meta.env.BASE_URL}models/${file}`;
}

async function loadEnemy(loader: GLTFLoader, id: string): Promise<EnemyVisuals[string]> {
  const type = ENEMY_TYPES.find((t) => t.id === id)!;
  const config = ENEMY_MODELS[id];
  const gltf = await loader.loadAsync(modelUrl(config.file));
  const clip = findClip(gltf.animations, config.clip);
  const frames = clip ? bakeClip(gltf.scene, clip, ENEMY_FRAMES) : [bakePose(gltf.scene)];
  fitGeometries(frames, { ...config.fit, size: type.size });

  const material = toonMaterial(0xffffff);
  material.vertexColors = true;
  return { frames, material, tint: new THREE.Color(1, 1, 1) };
}

async function loadHero(loader: GLTFLoader, file: string): Promise<HeroAsset> {
  const gltf = await loader.loadAsync(modelUrl(file));
  const scene = gltf.scene;
  const clips = {
    idle: findClip(gltf.animations, 'Idle'),
    run: findClip(gltf.animations, 'Run', 'Running'),
    death: findClip(gltf.animations, 'Death'),
  };

  // On mesure le modèle dans sa pose de repos animée (la pose de liaison est souvent bras écartés).
  const pose = clips.idle ? bakeClip(scene, clips.idle, 1) : [bakePose(scene)];
  const fit = fitMatrix(pose, { size: HERO_HEIGHT, axis: 'y' });
  pose[0].dispose();

  const root = new THREE.Group();
  const holder = new THREE.Group();
  holder.applyMatrix4(fit);
  holder.add(scene);
  root.add(holder);

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const source = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const toon = toonMaterial(source.color ?? 0xffffff);
    toon.map = source.map ?? null;
    mesh.material = toon;
    mesh.castShadow = true;
    // La boîte englobante d'un maillage à squelette ne suit pas l'animation.
    mesh.frustumCulled = false;
  });

  return { root, animated: scene, clips };
}

/**
 * Charge tous les modèles. Un modèle qui échoue est remplacé par une forme de secours :
 * le jeu reste jouable même sans ses fichiers 3D.
 */
export async function loadAssets(): Promise<Assets> {
  const loader = new GLTFLoader();
  const assets: Assets = { enemies: {}, heroes: {} };

  await Promise.all([
    ...ENEMY_TYPES.map(async (type) => {
      try {
        assets.enemies[type.id] = await loadEnemy(loader, type.id);
      } catch (error) {
        console.warn(`Modèle d'ennemi "${type.id}" indisponible, forme de secours utilisée.`, error);
        assets.enemies[type.id] = placeholderVisual(type);
      }
    }),
    ...CHARACTERS.map(async (character) => {
      try {
        assets.heroes[character.id] = await loadHero(loader, character.model);
      } catch (error) {
        console.warn(`Modèle du héros "${character.id}" indisponible, forme de secours utilisée.`, error);
      }
    }),
  ]);

  return assets;
}
