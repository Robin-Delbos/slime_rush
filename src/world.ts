import * as THREE from 'three';

/** Tirage pour le décor : volontairement indépendant de l'aléatoire de la simulation. */
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Demi-largeur de la zone jouable (le joueur est borné à ±ARENA). */
export const ARENA = 40;

const SKY = 0x8fd3ff;

let gradientMap: THREE.DataTexture | null = null;

/** Matériau cartoon : ombrage en 3 paliers nets au lieu d'un dégradé lisse. */
export function toonMaterial(color: THREE.ColorRepresentation): THREE.MeshToonMaterial {
  if (!gradientMap) {
    gradientMap = new THREE.DataTexture(new Uint8Array([95, 175, 255]), 3, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ color, gradientMap });
}

export type CameraMode = 'menu' | 'play';

export class World {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  readonly renderer: THREE.WebGLRenderer;

  private sun = new THREE.DirectionalLight(0xfff2d6, 2.0);
  private portrait = false;
  private mode: CameraMode = 'menu';
  /** Position de la caméra par rapport au joueur, lissée d'un mode à l'autre. */
  private offset = new THREE.Vector3(0, 2.3, 6);
  private targetOffset = new THREE.Vector3();
  private lookY = 1.1;
  /** Intensité du tremblement d'écran, de 0 à 1. */
  private trauma = 0;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 35, 80);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x7ccf5a, 1.2));

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -22;
    cam.right = 22;
    cam.top = 22;
    cam.bottom = -22;
    cam.near = 1;
    cam.far = 60;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.buildGround();
    this.buildDecor();

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.follow(0, 0, 1);
  }

  /** 'menu' : gros plan sur le héros ; 'play' : vue de dessus inclinée. */
  setMode(mode: CameraMode): void {
    this.mode = mode;
  }

  /** Secoue la caméra (dégâts subis, mort d'un gros ennemi). */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Place la caméra et le soleil (donc la zone d'ombres) autour du joueur. */
  follow(x: number, z: number, dt: number): void {
    const play = this.mode === 'play';
    // En portrait le champ horizontal est étroit : on recule la caméra.
    const zoom = this.portrait ? 1.35 : 1;
    if (play) this.targetOffset.set(0, 14 * zoom, 13 * zoom);
    else this.targetOffset.set(0, 2.3, this.portrait ? 7.5 : 6);

    const k = 1 - Math.exp(-dt * 5);
    this.offset.lerp(this.targetOffset, k);
    this.lookY += ((play ? 0.5 : 1.1) - this.lookY) * k;

    this.trauma = Math.max(0, this.trauma - dt * 2.5);
    const amplitude = this.trauma * this.trauma * 0.6;
    this.camera.position.set(
      x + this.offset.x + (Math.random() - 0.5) * amplitude,
      this.offset.y + (Math.random() - 0.5) * amplitude,
      z + this.offset.z,
    );
    this.camera.lookAt(x, this.lookY, z);
    this.sun.position.set(x + 10, 20, z + 8);
    this.sun.target.position.set(x, 0, z);
  }

  /** Point du sol situé sous une position de l'écran, ou null si le rayon part vers le ciel. */
  groundPoint(clientX: number, clientY: number): { x: number; z: number } | null {
    this.pointer.set((clientX / window.innerWidth) * 2 - 1, 1 - (clientY / window.innerHeight) * 2);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.ground, this.hit);
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = w < h;
    this.camera.updateProjectionMatrix();
  }

  private buildGround(): void {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#86dd5c';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#7bd253';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillRect(32, 32, 32, 32);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.anisotropy = 4;
    const size = 240;
    tex.repeat.set(size / 6, size / 6);

    const mat = toonMaterial(0xffffff);
    mat.map = tex;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  private buildDecor(): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    // Forêt : anneau d'arbres qui matérialise la limite de l'arène.
    const TREES = 320;
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.38, 1.4, 7).translate(0, 0.7, 0);
    const leafGeo = new THREE.ConeGeometry(1.5, 3, 8).translate(0, 2.7, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, toonMaterial(0x9b6a3c), TREES);
    const leaves = new THREE.InstancedMesh(leafGeo, toonMaterial(0x2fa35a), TREES);
    const leafColor = new THREE.Color();
    for (let i = 0; i < TREES; i++) {
      // Point aléatoire dans la bande située juste autour du carré jouable.
      const band = rand(ARENA + 2, ARENA + 16);
      const t = rand(-band, band);
      const side = Math.floor(Math.random() * 4);
      const x = side === 0 ? band : side === 1 ? -band : t;
      const z = side === 2 ? band : side === 3 ? -band : t;
      const scale = rand(0.8, 1.6);
      p.set(x, 0, z);
      q.setFromAxisAngle(up, rand(0, Math.PI * 2));
      s.setScalar(scale);
      m.compose(p, q, s);
      trunks.setMatrixAt(i, m);
      leaves.setMatrixAt(i, m);
      leaves.setColorAt(i, leafColor.setHSL(rand(0.36, 0.43), 0.6, rand(0.32, 0.42)));
    }
    trunks.castShadow = leaves.castShadow = true;
    trunks.frustumCulled = leaves.frustumCulled = false;
    this.scene.add(trunks, leaves);

    // Touffes d'herbe et cailloux : purement décoratifs, donnent un repère de mouvement.
    // Le décor reste dans les verts et les gris pour que tout objet coloré au sol
    // (gemme, pièce) soit immédiatement identifiable comme quelque chose à ramasser.
    const TUFTS = 500;
    const tufts = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.13, 0.42, 4).translate(0, 0.21, 0),
      toonMaterial(0xffffff),
      TUFTS,
    );
    const tuftColor = new THREE.Color();
    for (let i = 0; i < TUFTS; i++) {
      p.set(rand(-ARENA, ARENA), 0, rand(-ARENA, ARENA));
      q.setFromAxisAngle(up, rand(0, Math.PI * 2));
      s.set(rand(0.8, 1.5), rand(0.6, 1.4), rand(0.8, 1.5));
      m.compose(p, q, s);
      tufts.setMatrixAt(i, m);
      tufts.setColorAt(i, tuftColor.setHSL(rand(0.27, 0.33), 0.6, rand(0.36, 0.46)));
    }
    tufts.frustumCulled = false;
    this.scene.add(tufts);

    const ROCKS = 70;
    const rocks = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.5, 0),
      toonMaterial(0xa9b2c3),
      ROCKS,
    );
    for (let i = 0; i < ROCKS; i++) {
      const scale = rand(0.3, 0.7);
      p.set(rand(-ARENA, ARENA), scale * 0.15, rand(-ARENA, ARENA));
      // Pas de caillou sur le point de départ du joueur.
      if (Math.hypot(p.x, p.z) < 4) p.x += 8;
      q.setFromAxisAngle(up, rand(0, Math.PI * 2));
      s.set(scale, scale * 0.6, scale);
      m.compose(p, q, s);
      rocks.setMatrixAt(i, m);
    }
    rocks.castShadow = rocks.receiveShadow = true;
    rocks.frustumCulled = false;
    this.scene.add(rocks);
  }
}
