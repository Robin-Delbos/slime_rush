import * as THREE from 'three';

/**
 * "Cuisson" d'animations squelettiques en géométries statiques.
 *
 * Three.js ne sait pas instancier des maillages animés par squelette. Pour afficher des
 * centaines d'ennemis animés en quelques draw calls, on calcule une fois au chargement
 * la forme du modèle à N instants de son animation ; chaque image devient un InstancedMesh.
 */

const WHITE = new THREE.Color(1, 1, 1);

/** Fige la pose courante de `root` en une géométrie unique, couleurs de matériaux en couleurs de sommets. */
export function bakePose(root: THREE.Object3D): THREE.BufferGeometry {
  root.updateWorldMatrix(true, true);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const v = new THREE.Vector3();
  let offset = 0;

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh ? (mesh as THREE.SkinnedMesh) : null;
    const position = mesh.geometry.getAttribute('position');
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const color = material.color ?? WHITE;

    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      if (skinned) skinned.applyBoneTransform(i, v);
      v.applyMatrix4(mesh.matrixWorld);
      positions.push(v.x, v.y, v.z);
      colors.push(color.r, color.g, color.b);
    }

    const index = mesh.geometry.getIndex();
    if (index) for (let i = 0; i < index.count; i++) indices.push(index.getX(i) + offset);
    else for (let i = 0; i < position.count; i++) indices.push(i + offset);
    offset += position.count;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return geometry;
}

/** Cuit `frames` images régulièrement réparties sur la durée du clip. */
export function bakeClip(root: THREE.Object3D, clip: THREE.AnimationClip, frames: number): THREE.BufferGeometry[] {
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const result: THREE.BufferGeometry[] = [];
  for (let i = 0; i < frames; i++) {
    mixer.setTime((clip.duration * i) / frames);
    result.push(bakePose(root));
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  return result;
}

export interface FitOptions {
  /** Taille visée le long de `axis`. */
  size: number;
  /** 'y' : hauteur ; 'x' : largeur (créatures volantes aux ailes déployées). */
  axis: 'x' | 'y';
  /** Altitude du point le plus bas du modèle. */
  hover?: number;
  /** Rotation autour de la verticale pour que le modèle regarde vers +Z. */
  rotationY?: number;
}

/** Boîte englobante commune à toutes les images. */
function unionBox(geometries: THREE.BufferGeometry[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const g of geometries) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  return box;
}

/** Calcule la transformation qui met un modèle à l'échelle, le centre et le pose au sol. */
export function fitMatrix(geometries: THREE.BufferGeometry[], options: FitOptions): THREE.Matrix4 {
  const rotation = new THREE.Matrix4().makeRotationY(options.rotationY ?? 0);
  const rotated = geometries.map((g) => g.clone().applyMatrix4(rotation));
  const box = unionBox(rotated);
  const extent = options.axis === 'x' ? box.max.x - box.min.x : box.max.y - box.min.y;
  const scale = options.size / (extent || 1);
  const center = box.getCenter(new THREE.Vector3());
  for (const g of rotated) g.dispose();

  return new THREE.Matrix4()
    .makeTranslation(0, options.hover ?? 0, 0)
    .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z))
    .multiply(rotation);
}

/** Applique `fitMatrix` à toutes les images puis recalcule les normales. */
export function fitGeometries(geometries: THREE.BufferGeometry[], options: FitOptions): void {
  const matrix = fitMatrix(geometries, options);
  for (const g of geometries) {
    g.applyMatrix4(matrix);
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }
}
